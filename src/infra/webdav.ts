/**
 * WebDAV 瘦封装：包 webdav 库，只出备份要用的远端文件操作
 * 领域无关——不含备份路径 / 信封 / config 知识（那些在 core/backup）
 * webdav@5 提供 react-native 专用构建，Metro 经 package exports 的 react-native 条件解析
 *
 * 每个请求都自带超时预算，且预算到点会真去 abort：RN 把 OkHttp 的连接 / 读 / 写超时
 * 全设成 0（= 永不超时），而库的 RN 构建里一处 AbortController 都没有。不自己掐，
 * 「TCP 连上但服务端不回包」的服务器就能让请求永远悬着，页面上的忙碌态也永远不落地
 */
import { URL } from 'react-native-url-polyfill';
import {
    AuthType,
    createClient,
    parseStat,
    parseXML,
    type FileStat,
    type RequestOptionsCustom,
    type WebDAVClient,
} from 'webdav';

import { delay } from '@/infra/timer';

/** WebDAV 连接凭据；由 core/backup 从 config 读出后传入，本模块不碰 config */
export interface WebdavCredentials {
    url: string;
    username: string;
    password: string;
}

/** 建库时的可选项 */
export interface WebdavStoreOptions {
    /**
     * 取消信号：abort 后本库上所有在途与后续请求都以 `WebdavRequestError('cancelled')` 结束
     * 一个库对应一次用户操作，故取消是库级而非请求级
     */
    signal?: AbortSignal;
}

/** 请求没走完的两种结局；都不是服务端给出的答复，UX 上不能与 401 / 404 混为一谈 */
export type WebdavRequestFailure = 'timeout' | 'cancelled';

/** 超时或被取消时抛出；`kind` 供 UX 区分「服务器没回」与「用户自己停的」 */
export class WebdavRequestError extends Error {
    readonly kind: WebdavRequestFailure;

    constructor(kind: WebdavRequestFailure) {
        super(
            kind === 'timeout'
                ? 'webdav request timed out'
                : 'webdav request cancelled',
        );
        this.name = 'WebdavRequestError';
        this.kind = kind;
    }
}

/**
 * 元数据请求（PROPFIND / MKCOL / MOVE / DELETE）的超时预算（ms）
 * 这些请求只换几百字节，等 20s 还没回包就不是慢，是不会回了
 */
const METADATA_TIMEOUT_MS = 20_000;

/** 传输请求的固定余量（ms）：握手、鉴权重试与服务端落盘都算在这里 */
const TRANSFER_TIMEOUT_BASE_MS = 20_000;

/**
 * 折算正文时间用的吞吐地板：16 B/ms = 16 KiB/s（128 kbps）
 *
 * 取「比任何还能用的链路都慢」的值：3G 实测在 50 KiB/s 上下，糟糕的共享 Wi-Fi 约 30 KiB/s。
 * 地板再低（例如 8 KiB/s）折出的预算就失真——一份 64 MiB 的备份会拿到两个多小时，
 * 那时挂起与传输在观感上没有区别；地板再高就会掐断慢网上仍在正常传输的备份
 */
const TRANSFER_FLOOR_BYTES_PER_MS = 16;

/**
 * 传输请求（GET / PUT 备份正文）的超时预算 = 固定余量 + 按吞吐地板折算的正文时间
 *
 * 单一固定值两头都不成立：20s 会掐死慢网上的大备份，而按大备份取的固定值会让一份 50 KB
 * 备份的挂起白等几十分钟。RN 的 fetch 在 promise 结算前原生侧已把整个正文收完 / 发完，
 * 故这份预算覆盖的是整次传输，而不只是等首包
 *
 * 大小不可信（服务端不报 content-length：库把缺失当 "0"、空值 parseInt 成 NaN）时退化成
 * 固定余量。**调用方要自己把未知换成一个可信上界**——只有它知道自己这条链路允许多大，
 * 本模块猜一个「典型大小」只会掐断比它大的合法传输
 */
function transferTimeoutFor(byteCount: number): number {
    const bytes = Number.isFinite(byteCount) && byteCount > 0 ? byteCount : 0;
    return TRANSFER_TIMEOUT_BASE_MS + bytes / TRANSFER_FLOOR_BYTES_PER_MS;
}

/**
 * 跑一次远端请求：给它一份超时预算，并把库级取消信号接进去
 *
 * 预算到点做两件事，两件都必需：
 * 1. abort 那个请求——尽力真把连接掐掉，不白占一条 socket；
 * 2. **让本函数的 promise 一定 reject**。abort 只是「尽力」：库里若有一处没把 signal
 *    传下去（webdav 的递归建目录就是这样，见 `ensureDir`），光 abort 会让 promise 永远
 *    悬着，上层的操作锁跟着永久卡住——那正是这次要消灭的症状。故不能只依赖 abort 生效
 *
 * abort 之后 fetch 抛的是笼统的 AbortError，分不出「谁掐的」，故这里按自己掌握的
 * 事实还原成 timeout / cancelled——调用方要靠它区分「服务器没回」与「用户停的」
 */
async function runRequest<T>(
    budgetMs: number,
    external: AbortSignal | undefined,
    run: (signal: AbortSignal) => Promise<T>,
    method?: string,
): Promise<T> {
    if (external?.aborted) {
        throw new WebdavRequestError('cancelled');
    }
    const request = new AbortController();

    // 计时器自己也要能撤：否则每个请求都留下一个到点才醒的原生 timer
    const timer = new AbortController();
    let timedOut = false;
    const budget = delay(budgetMs, {
        runInBackground: true,
        signal: timer.signal,
    }).then(() => {
        timedOut = true;
        request.abort();
        throw new WebdavRequestError('timeout');
    });
    // 请求先结算时计时器被撤掉，budget 会以 AbortError reject 而 race 早已散场；
    // 挂个吞掉的 handler，免得变成 unhandled rejection
    budget.catch(() => undefined);

    /*
     * 取消也要有自己的一条腿，与预算那条对称：只 abort 是「尽力」，
     * 底下若有一处没把 signal 传下去，用户按了取消就得干等到预算到点（可能几十分钟）才 reject，
     * 期间锁还占着、横幅还挂着——那就是原 bug 换个触发方式重演
     */
    let rejectCancelled: ((error: WebdavRequestError) => void) | undefined;
    const cancellation =
        external === undefined
            ? undefined
            : new Promise<never>((_resolve, reject) => {
                  rejectCancelled = reject;
              });
    cancellation?.catch(() => undefined);
    const onExternalAbort = () => {
        request.abort();
        rejectCancelled?.(new WebdavRequestError('cancelled'));
    };
    // 注册在 cancellation 建好之后：abort 只能由外部触发，插不到这两句中间
    external?.addEventListener('abort', onExternalAbort, { once: true });

    try {
        const racers: Promise<T>[] = [run(request.signal), budget];
        if (cancellation) {
            racers.push(cancellation);
        }
        return await Promise.race(racers);
    } catch (error) {
        if (error instanceof WebdavRequestError) {
            throw error;
        }
        /*
         * 请求因我们的 abort 而抛 AbortError 时，它可能比 budget / cancellation 先赢下 race
         *
         * **取消排在超时前面**：两者同轮到达时（预算到点的同一个同步块里用户按了取消），
         * 认 signal 的库会让 run 的 AbortError 先赢，此时 timedOut 与 external.aborted 同真。
         * 报「取消」才对——用户按的就是取消，他要的是别再报一遍；报「超时」会让他
         * 在按下取消之后反而挨一句「服务器一直没有响应」。
         * 这样也让「库认不认 signal」两条路给出同一个答案
         */
        if (external?.aborted) {
            throw new WebdavRequestError('cancelled');
        }
        if (timedOut) {
            throw new WebdavRequestError('timeout');
        }
        if (
            error instanceof Error &&
            typeof (error as { status?: unknown }).status === 'number'
        ) {
            const status = (error as Error & { status: number }).status;
            throw Object.assign(
                new Error(`WebDAV ${method ?? 'request'}: HTTP ${status}`),
                { status },
            );
        }
        throw error;
    } finally {
        timer.abort();
        external?.removeEventListener('abort', onExternalAbort);
    }
}

/**
 * 目录路径 → 从最外层到自身的每一级（`/a/b` → `['/a', '/a/b']`）
 * 空段忽略，容忍重复与结尾斜杠；根路径（`/` 或空串）给空数组——根不需要创建，
 * 于是 `ensureDir('/')` 一个请求都不发就成功，这是对的
 */
function dirLevels(path: string): string[] {
    const segments = path.split('/').filter(segment => segment.length > 0);
    return segments.map(
        (_segment, index) => `/${segments.slice(0, index + 1).join('/')}`,
    );
}

/** 远端文件存储端口：core/backup 注入此接口，不直接依赖 webdav 库 */
export interface WebdavStore {
    /** 探测连通性 + 鉴权；失败时 throw */
    testConnection(): Promise<void>;
    /** 远端路径是否存在 */
    exists(path: string): Promise<boolean>;
    /**
     * 远端文件字节数；路径不存在或不是文件时 throw
     * **这个数不一定可信**：服务端可以不报 content-length，库把缺失当 `"0"`、
     * 空值 `parseInt` 出 `NaN`——类型上是 number，运行时可能是 0 或 NaN，调用方要自己判
     */
    getFileSize(path: string): Promise<number>;
    /** 确保目录存在（逐级创建）；该路径被同名文件占用时 throw */
    ensureDir(path: string): Promise<void>;
    /**
     * 读远端文本文件
     * `budgetBytes` 只用于折算传输超时预算；服务端可能不报大小，调用方须给出**可信上界**
     * 而不是猜测——给小了会掐断仍在正常下载的大文件
     */
    readFile(path: string, budgetBytes: number): Promise<string>;
    /**
     * 写远端文本文件（覆盖已存在）
     * `byteCount` 由调用方给出而非这里重算：它本来就要算一次，
     * 而在几十 MiB 的文本上按码点再扫一遍纯属白花时间
     */
    writeFile(path: string, data: string, byteCount: number): Promise<void>;
    /** 移动远端文件，覆盖目标；供「先传临时文件再就位」的发布方式使用 */
    moveFile(from: string, to: string): Promise<void>;
    /** 删除远端文件；供清理上传残留 */
    remove(path: string): Promise<void>;
}

/** 按凭据建一个绑定的 WebdavStore；实际网络请求在各方法调用时才发生 */
export function createWebdavStore(
    cred: WebdavCredentials,
    options?: WebdavStoreOptions,
): WebdavStore {
    const client: WebDAVClient = createClient(cred.url, {
        // 先带 Basic 试，收到 Digest challenge 就切过去并记住；写死 Password 连不上只认 Digest 的服务端
        authType: AuthType.Auto,
        username: cred.username,
        password: cred.password,
    });
    const external = options?.signal;

    /** 元数据请求：一份固定预算 */
    const meta = <T>(
        method: string,
        run: (signal: AbortSignal) => Promise<T>,
    ): Promise<T> => runRequest(METADATA_TIMEOUT_MS, external, run, method);

    const request = async (
        path: string,
        requestOptions: RequestOptionsCustom,
    ) => {
        const response = await client.customRequest(path, requestOptions);
        if (!response.ok) {
            throw Object.assign(
                new Error(
                    `WebDAV ${requestOptions.method}: HTTP ${response.status}`,
                ),
                {
                    status: response.status,
                },
            );
        }
        return response;
    };

    const readStat = async (
        path: string,
        signal: AbortSignal,
    ): Promise<FileStat> => {
        const response = await request(path, {
            method: 'PROPFIND',
            headers: { Accept: 'text/plain,application/xml', Depth: '0' },
            signal,
        });
        return parseStat(await parseXML(await response.text()), path);
    };

    /**
     * stat 一个路径：**只有 404** 才给 undefined（当作「不存在」，由调用方决定去建）
     *
     * 其余错误一律原样抛，与库递归分支的判据一致（它也是 `error.status === 404` 才开始创建）：
     * 把 503 / 401 / 网络错误也当成「不存在」会先吞掉真正的故障、再多发一次注定失败的
     * MKCOL，最后报出来的是第二个错误——诊断时看到的就不是病根
     * 超时 / 取消更要照抛：把「服务器没回包」当成「不存在」等于再白等一份预算
     */
    const statOrUndefined = async (
        target: string,
    ): Promise<FileStat | undefined> => {
        try {
            return await meta('PROPFIND', signal => readStat(target, signal));
        } catch (error) {
            // 库给响应类错误挂 status（response.js 的 createErrorFromResponse）
            if (
                error instanceof Error &&
                (error as { status?: number }).status === 404
            ) {
                return undefined;
            }
            throw error;
        }
    };

    return {
        async testConnection() {
            // 用 stat 而非列目录：PROPFIND Depth-0，不会把根下成千上万个条目拉回来
            await meta('PROPFIND', signal => readStat('/', signal));
        },
        async exists(path) {
            return (await statOrUndefined(path)) !== undefined;
        },
        async getFileSize(path) {
            const info = await meta('PROPFIND', signal =>
                readStat(path, signal),
            );
            if (info.type !== 'file') {
                throw new Error(`WebDAV 远端 ${path} 不是文件`);
            }
            return info.size;
        },
        async ensureDir(path) {
            /**
             * 不把 `recursive: true` 交给库：那条分支每一级的预检 stat 是
             * `getStat(context, testPath)`（dist/node/operations/createDirectory.js:50），
             * **不透传 options**，signal 丢在里面——于是那次 PROPFIND 不可取消。
             * 自己逐级走，每个请求都带上 signal；非递归的 MKCOL 走
             * `prepareRequestOptions`，signal 是转发的
             *
             * 逐级的多次请求各自一份预算：它们是各自独立的往返，共用一份会让
             * 层数多的路径先天吃亏
             */
            for (const level of dirLevels(path)) {
                const existing = await statOrUndefined(level);
                if (existing?.type === 'directory') {
                    continue;
                }
                if (existing !== undefined) {
                    throw new Error(`WebDAV 远端 ${level} 被同名文件占用`);
                }
                try {
                    await meta('MKCOL', signal =>
                        request(level, { method: 'MKCOL', signal }),
                    );
                } catch (error) {
                    // 超时 / 被取消不是「并发方刚好建好了」，再探一次只会在同一台不回包的服务器上白等一份预算
                    if (error instanceof WebdavRequestError) {
                        throw error;
                    }
                    // 并发方可能刚好在这中间建好；确认目标确实已是目录才当作成功
                    const after = await statOrUndefined(level);
                    if (after?.type !== 'directory') {
                        throw error;
                    }
                }
            }
        },
        async readFile(path, budgetBytes) {
            return runRequest(
                transferTimeoutFor(budgetBytes),
                external,
                async signal =>
                    (await request(path, { method: 'GET', signal })).text(),
                'GET',
            );
        },
        async writeFile(path, data, byteCount) {
            // contentLength 给数字：库默认 true 会自己再按码点扫一遍同一个字符串
            // （operations/putFileContents.js 的 calculateDataLength），几十 MiB 上是白扫
            await runRequest(
                transferTimeoutFor(byteCount),
                external,
                signal =>
                    request(path, {
                        method: 'PUT',
                        data,
                        headers: {
                            'Content-Type': 'application/octet-stream',
                            'Content-Length': String(byteCount),
                        },
                        signal,
                    }),
                'PUT',
            );
        },
        async moveFile(from, to) {
            const destination = new URL(cred.url);
            const encodedPath = to.split('/').map(encodeURIComponent).join('/');
            destination.pathname = `${destination.pathname.replace(
                /\/+$/,
                '',
            )}/${encodedPath.replace(/^\/+/, '')}`;
            destination.username = '';
            destination.password = '';
            destination.search = '';
            destination.hash = '';
            await meta('MOVE', signal =>
                request(from, {
                    method: 'MOVE',
                    headers: {
                        Destination: destination.toString(),
                        Overwrite: 'T',
                    },
                    signal,
                }),
            );
        },
        async remove(path) {
            await meta('DELETE', signal =>
                request(path, { method: 'DELETE', signal }),
            );
        },
    };
}
