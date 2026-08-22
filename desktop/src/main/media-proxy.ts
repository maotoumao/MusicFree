/**
 * 媒体代理
 *
 * 1. 拦截渲染进程的 http/https 请求:
 *    - 去除 Origin/Referer(规避音源接口的防盗链)
 *    - 响应附加 CORS 头(插件与 axios 在浏览器环境不再受跨域限制)
 *    - 预检(OPTIONS)直接放行,不回源
 *    - Range / 流式响应原样透传,音视频拖动进度可用
 * 2. musicfree-local:// 协议:
 *    - 渲染进程以受控方式访问本地媒体文件(封面/本地音乐),
 *      并原生支持 Range,替代 Android 端的 file:// 直读。
 */
import { app, net, protocol } from "electron";
import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";

const PROXY_UA =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

/** 注册自定义协议特权(必须在 app ready 之前) */
export function registerSchemes() {
    protocol.registerSchemesAsPrivileged([
        {
            scheme: "musicfree-local",
            privileges: {
                standard: true,
                secure: true,
                supportFetchAPI: true,
                stream: true,
                corsEnabled: true,
            },
        },
    ]);
}

const HOP_BY_HOP = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "host",
    "origin",
    "referer",
]);

function buildUpstreamRequest(request: Request): Request {
    const headers = new Headers();
    for (const [key, value] of (request.headers as any).entries?.() ?? []) {
        const lower = key.toLowerCase();
        if (HOP_BY_HOP.has(lower)) continue;
        headers.set(key, value);
    }
    if (!headers.has("user-agent")) {
        headers.set("user-agent", PROXY_UA);
    }
    const hasBody =
        request.method !== "GET" &&
        request.method !== "HEAD" &&
        request.body != null;
    return new Request(request.url, {
        method: request.method,
        headers,
        body: hasBody ? request.body : undefined,
        redirect: "follow",
        // @ts-ignore node fetch 需要 duplex 才能传流
        duplex: hasBody ? "half" : undefined,
    });
}

function withCorsHeaders(headers: Headers): Headers {
    const out = new Headers(headers);
    out.set("access-control-allow-origin", "*");
    out.set("access-control-expose-headers", "*");
    out.set("timing-allow-origin", "*");
    return out;
}

function preflightResponse(request: Request): Response {
    const headers = new Headers();
    headers.set("access-control-allow-origin", "*");
    const requestHeaders = request.headers.get("access-control-request-headers");
    if (requestHeaders) {
        headers.set("access-control-allow-headers", requestHeaders);
    } else {
        headers.set("access-control-allow-headers", "*");
    }
    headers.set("access-control-allow-methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD");
    headers.set("access-control-max-age", "86400");
    return new Response(null, { status: 204, headers });
}

async function proxyHandler(request: Request): Promise<Response> {
    // 预检请求直接放行
    if (
        request.method === "OPTIONS" &&
        request.headers.has("access-control-request-method")
    ) {
        return preflightResponse(request);
    }

    try {
        const upstream = buildUpstreamRequest(request);
        const response = await net.fetch(upstream);
        const headers = withCorsHeaders(new Headers(response.headers));
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    } catch (err: any) {
        console.warn("[media-proxy] request failed:", request.url, err?.message);
        const headers = new Headers({ "content-type": "application/json" });
        headers.set("access-control-allow-origin", "*");
        return new Response(
            JSON.stringify({ message: `proxy error: ${err?.message ?? err}` }),
            { status: 502, headers },
        );
    }
}

// ------------------------------------------------------- 本地文件协议
const MIME_MAP: Record<string, string> = {
    ".mp3": "audio/mpeg",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".opus": "audio/ogg",
    ".wav": "audio/wav",
    ".wma": "audio/x-ms-wma",
    ".ape": "audio/x-ape",
    ".m3u8": "application/vnd.apple.mpegurl",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".lrc": "text/plain; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
};

function guessMime(filePath: string): string {
    return MIME_MAP[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function nodeStreamToWeb(stream: fs.ReadStream): ReadableStream<Uint8Array> {
    return Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
}

async function localFileHandler(request: Request): Promise<Response> {
    // musicfree-local://p/<encodeURIComponent(absolutePath)>
    const url = new URL(request.url);
    let filePath: string;
    try {
        filePath = decodeURIComponent(url.pathname.replace(/^\/p\//, ""));
    } catch {
        return new Response("bad path", { status: 400 });
    }
    if (!path.isAbsolute(filePath)) {
        return new Response("invalid path", { status: 400 });
    }

    let stat: fs.Stats;
    try {
        stat = await fs.promises.stat(filePath);
    } catch {
        return new Response("not found", { status: 404 });
    }
    if (!stat.isFile()) {
        return new Response("not a file", { status: 404 });
    }

    const mime = guessMime(filePath);
    const headers = new Headers({
        "content-type": mime,
        "accept-ranges": "bytes",
        "access-control-allow-origin": "*",
    });

    // Range 支持(音频 seek)
    const range = request.headers.get("range");
    const match = range?.match(/bytes=(\d*)-(\d*)/);
    if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2]
            ? Math.min(parseInt(match[2], 10), stat.size - 1)
            : stat.size - 1;
        if (start <= end && start < stat.size) {
            headers.set("content-range", `bytes ${start}-${end}/${stat.size}`);
            headers.set("content-length", String(end - start + 1));
            const stream = fs.createReadStream(filePath, { start, end });
            return new Response(nodeStreamToWeb(stream), { status: 206, headers });
        }
        headers.set("content-range", `bytes */${stat.size}`);
        return new Response(null, { status: 416, headers });
    }

    headers.set("content-length", String(stat.size));
    const stream = fs.createReadStream(filePath);
    return new Response(nodeStreamToWeb(stream), { status: 200, headers });
}

/** 在 app ready 后调用 */
export function setupMediaProxy() {
    protocol.handle("http", proxyHandler);
    protocol.handle("https", proxyHandler);
    protocol.handle("musicfree-local", localFileHandler);
}
