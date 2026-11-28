/**
 * URL 判定：统一走 WHATWG 解析器（`react-native-url-polyfill`，同 core/plugin 沙箱与音源解析）
 * 不自己写正则——主机、端口、IPv6、百分号编码、内嵌凭据的边界太多，手写必漏
 */
import { URL as WhatwgURL } from 'react-native-url-polyfill';

/**
 * 粘贴带进来的噪音：任意位置的换行 / 制表 / 零宽字符 / 词连接符 / 软连字符 / BOM
 * 换行 / 制表 WHATWG 自己也会剥掉；零宽这类不可见字符是聊天软件、富文本复制塞进来的，用户看不见、
 * 也打不出，夹在链接里无从自查——删掉是有意取舍：代价是资源名里真含零宽字符的地址无法被指定，
 * 这类资源名本就近乎不存在。**空格不在其中**：`/my plugin.js` 是个可以存在的路径，交给 WHATWG
 * 编码成 `%20` 才是对的；只有首尾空白按普通输入清理
 */
const PASTE_NOISE = /[\t\n\r\u200B-\u200D\u2060\uFEFF\u00AD]/g;

/** 按 http(s) 解析（只 trim 首尾）；不是合法 http(s) 地址时 undefined */
function parseHttp(value: string): WhatwgURL | undefined {
    let parsed: WhatwgURL;
    try {
        parsed = new WhatwgURL(value.trim());
    } catch {
        return undefined;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return undefined;
    }
    return parsed.host.length > 0 ? parsed : undefined;
}

/**
 * 取 http(s) 地址的主机（含端口）；不是合法 http(s) 地址时 undefined
 * `host` 天然不含 `user:pass@` 部分——内嵌凭据既不该展示给用户，也不该进日志
 */
export function httpHostOf(value: string): string | undefined {
    return parseHttp(value)?.host;
}

/** 是否是可用的 http(s) 地址（挡住非地址输入，给准确文案而非误导的网络错误）；不做去噪，与请求方用的原串同口径 */
export function looksLikeHttpUrl(value: string): boolean {
    return parseHttp(value) !== undefined;
}

/**
 * 把用户粘贴的输入规范成可直接发请求的 http(s) 地址：去掉 PASTE_NOISE、WHATWG 序列化（空格等编码为 %xx）；
 * 不是合法地址时 undefined
 * 校验与请求必须用同一个串：凡是用它判过「合法」的入口，就拿它的返回值去请求 / 落库，
 * 否则 WHATWG 校验时静默容忍的换行会让「校验通过、请求必挂」，用户只看到一句「网络错误」
 */
export function normalizeHttpUrl(value: string): string | undefined {
    const parsed = parseHttp(value.replace(PASTE_NOISE, ''));
    if (!parsed) {
        return undefined;
    }
    // fragment 不会发给服务器，对取源没意义；留着还会让字符串拼接的 query（如缓存穿透的时间戳）落进 # 后面静默失效
    parsed.hash = '';
    return parsed.href;
}
