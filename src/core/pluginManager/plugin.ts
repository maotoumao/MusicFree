import {
    CacheControl,
    internalSerializeKey,
    localPluginPlatform,
} from "@/constants/commonConst";
import pathConst from "@/constants/pathConst";
import Mp3Util from "@/native/mp3Util";
import Base64 from "@/utils/base64";
import delay from "@/utils/delay";
import { addFileScheme, getFileName } from "@/utils/fileUtils";
import { getMediaExtraProperty, patchMediaExtra } from "@/utils/mediaExtra";
import { getLocalPath, isSameMediaItem, resetMediaItem } from "@/utils/mediaUtils";
import notImplementedFunction from "@/utils/notImplementedFunction.ts";
import axios from "axios";
import bigInt from "big-integer";
import * as cheerio from "cheerio";
import { satisfies } from "compare-versions";
import CryptoJs from "crypto-js";
import dayjs from "dayjs";
import he from "he";
import { produce } from "immer";
import { nanoid } from "nanoid";
import objectPath from "object-path";
import qs from "qs";
import { default as DeviceInfo, default as deviceInfoModule } from "react-native-device-info";
import RNFS, { exists, readFile, stat, writeFile } from "react-native-fs";
import { URL } from "react-native-url-polyfill";
import * as webdav from "webdav";
import { devLog, errorLog, trace } from "../../utils/log";
import Network from "../../utils/network";
import MediaCache from "../mediaCache";
import _internalPluginMeta from "./meta";
import { IPluginManager } from "@/types/core/pluginManager";


axios.defaults.timeout = 2000;
axios.interceptors.response.use((response) => {
    // 统一setcookie格式，nodejs环境是数组，移动端环境都放在第一个元素
    const setCookie = response.headers["set-cookie"];
    if(setCookie && setCookie.length === 1) {
        const splitedCookie = setCookie[0].split(",");
        response.headers["set-cookie"] = splitedCookie;
        response.headers["x-set-cookie"] = setCookie;
    }

    return response;
});

const sha256 = CryptoJs.SHA256;

const deprecatedCookieManager = {
    get: notImplementedFunction,
    set: notImplementedFunction,
    flush: notImplementedFunction,
};

const packages: Record<string, any> = {
    cheerio,
    "crypto-js": CryptoJs,
    axios,
    dayjs,
    "big-integer": bigInt,
    qs,
    he,
    "@react-native-cookies/cookies": deprecatedCookieManager,
    webdav,
};

const _require = (packageName: string) => {
    let pkg = packages[packageName];
    pkg.default = pkg;
    return pkg;
};

const _consoleBind = function (
    method: "log" | "error" | "info" | "warn",
    ...args: any
) {
    const fn = console[method];
    if (fn) {
        fn(...args);
        devLog(method, ...args);
    }
};

const _console = {
    log: _consoleBind.bind(null, "log"),
    warn: _consoleBind.bind(null, "warn"),
    info: _consoleBind.bind(null, "info"),
    error: _consoleBind.bind(null, "error"),
};

const appVersion = deviceInfoModule.getVersion();

function formatAuthUrl(url: string) {
    const urlObj = new URL(url);

    try {
        if (urlObj.username && urlObj.password) {
            const auth = `Basic ${Base64.btoa(
                `${decodeURIComponent(urlObj.username)}:${decodeURIComponent(
                    urlObj.password,
                )}`,
            )}`;
            urlObj.username = "";
            urlObj.password = "";

            return {
                url: urlObj.toString(),
                auth,
            };
        }
    } catch (e) {
        return {
            url,
        };
    }
    return {
        url,
    };
}

export enum PluginState {
    // 加载中
    Loading,
    // 已加载
    Mounted,
    // 出现错误
    Error
}

export enum PluginErrorReason {
    // 版本不匹配
    VersionNotMatch,
    // 无法解析
    CannotParse,
}

class PluginMethodsWrapper implements IPlugin.IPluginInstanceMethods {
    private plugin: Plugin;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }


    /** 搜索 */
    async search<T extends ICommon.SupportMediaType>(
        query: string,
        page: number,
        type: T,
    ): Promise<IPlugin.ISearchResult<T>> {
        if (!this.plugin.instance.search) {
            return {
                isEnd: true,
                data: [],
            };
        }

        const result =
            (await this.plugin.instance.search(query, page, type)) ?? {};
        if (Array.isArray(result.data)) {
            result.data.forEach(_ => {
                resetMediaItem(_, this.plugin.name);
            });
            return {
                isEnd: result.isEnd ?? true,
                data: result.data,
            };
        }
        return {
            isEnd: true,
            data: [],
        };
    }

    /** 获取真实源 */
    async getMediaSource(
        musicItem: IMusic.IMusicItemBase,
        quality: IMusic.IQualityKey = "standard",
        retryCount = 1,
        notUpdateCache = false,
    ): Promise<IPlugin.IMediaSourceResult | null> {
        // 1. 本地搜索 其实直接读mediameta就好了
        const localPathInMediaExtra = getMediaExtraProperty(musicItem, "localPath");
        const localPath = getLocalPath(musicItem);
        if (localPath && (await exists(localPath))) {
            trace("本地播放", localPath);
            if (localPathInMediaExtra !== localPath) {
                // 修正一下本地数据
                patchMediaExtra(musicItem, {
                    localPath,
                });

            }
            return {
                url: addFileScheme(localPath),
            };
        } else if (localPathInMediaExtra) {
            patchMediaExtra(musicItem, {
                localPath: undefined,
            });
        }

        if (musicItem.platform === localPluginPlatform) {
            throw new Error("本地音乐不存在");
        }
        // 2. 缓存播放
        const mediaCache = MediaCache.getMediaCache(
            musicItem,
        ) as IMusic.IMusicItem | null;
        const pluginCacheControl =
            this.plugin.instance.cacheControl ?? "no-cache";
        if (
            mediaCache &&
            mediaCache?.source?.[quality]?.url &&
            (pluginCacheControl === CacheControl.Cache ||
                (pluginCacheControl === CacheControl.NoCache &&
                    Network.isOffline))
        ) {
            trace("播放", "缓存播放");
            const qualityInfo = mediaCache.source[quality];
            return {
                url: qualityInfo!.url,
                headers: mediaCache.headers,
                userAgent:
                    mediaCache.userAgent ?? mediaCache.headers?.["user-agent"],
            };
        }
        // 3. 替代插件
        const alternativePlugin = Plugin.pluginManager?.getAlternativePlugin(this.plugin) as Plugin | null;
        const parserPlugin = alternativePlugin?.instance?.getMediaSource ? alternativePlugin : this.plugin;

        if (alternativePlugin) {
            devLog("info", "设置了替代插件，实际使用的插件为", parserPlugin.name);
        }

        // 4. 插件解析
        if (!parserPlugin.instance.getMediaSource) {
            const { url, auth } = formatAuthUrl(
                musicItem?.qualities?.[quality]?.url ?? musicItem.url,
            );
            return {
                url: url,
                headers: auth
                    ? {
                        Authorization: auth,
                    }
                    : undefined,
            };
        }
        try {
            const { url, headers } = (await parserPlugin.instance.getMediaSource(
                musicItem,
                quality,
            )) ?? { url: musicItem?.qualities?.[quality]?.url };
            if (!url) {
                throw new Error("NOT RETRY");
            }
            trace("播放", "插件播放");
            const result = {
                url,
                headers,
                userAgent: headers?.["user-agent"],
            } as IPlugin.IMediaSourceResult;
            const authFormattedResult = formatAuthUrl(result.url!);
            if (authFormattedResult.auth) {
                result.url = authFormattedResult.url;
                result.headers = {
                    ...(result.headers ?? {}),
                    Authorization: authFormattedResult.auth,
                };
            }

            if (
                pluginCacheControl !== CacheControl.NoStore &&
                !notUpdateCache
            ) {
                // 更新缓存
                const cacheSource = {
                    headers: result.headers,
                    userAgent: result.userAgent,
                    url,
                };
                let realMusicItem = {
                    ...musicItem,
                    ...(mediaCache || {}),
                };
                realMusicItem.source = {
                    ...(realMusicItem.source || {}),
                    [quality]: cacheSource,
                };

                MediaCache.setMediaCache(realMusicItem);
            }
            return result;
        } catch (e: any) {
            if (retryCount > 0 && e?.message !== "NOT RETRY") {
                await delay(150);
                return this.getMediaSource(musicItem, quality, --retryCount);
            }
            errorLog("获取真实源失败", e?.message);
            devLog("error", "获取真实源失败", e, e?.message);
            return null;
        }
    }

    /** 获取音乐详情 */
    async getMusicInfo(
        musicItem: ICommon.IMediaBase,
    ): Promise<Partial<IMusic.IMusicItem> | null> {
        if (!this.plugin.instance.getMusicInfo) {
            return null;
        }
        try {
            return (
                this.plugin.instance.getMusicInfo(
                    resetMediaItem(musicItem, undefined, true),
                ) ?? null
            );
        } catch (e: any) {
            devLog("error", "获取音乐详情失败", e, e?.message);
            return null;
        }
    }

    /**
     *
     * getLyric(musicItem) => {
     *      lyric: string;
     *      trans: string;
     * }
     *
     */
    /** 获取歌词 */
    async getLyric(
        originalMusicItem: IMusic.IMusicItemBase,
    ): Promise<ILyric.ILyricSource | null> {
        // 1.额外存储的meta信息（关联歌词）
        const associatedLrc = getMediaExtraProperty(originalMusicItem, "associatedLrc");
        let musicItem: IMusic.IMusicItem;
        if (associatedLrc) {
            musicItem = associatedLrc as IMusic.IMusicItem;
        } else {
            musicItem = originalMusicItem as IMusic.IMusicItem;
        }

        const musicItemCache = MediaCache.getMediaCache(
            musicItem,
        ) as IMusic.IMusicItemCache | null;

        /** 原始歌词文本 */
        let rawLrc: string | null = musicItem.rawLrc || null;
        let translation: string | null = null;

        // 2. 本地手动设置的歌词
        const platformHash = CryptoJs.MD5(musicItem.platform).toString(
            CryptoJs.enc.Hex,
        );
        const idHash = CryptoJs.MD5(musicItem.id).toString(CryptoJs.enc.Hex);
        if (
            await RNFS.exists(
                pathConst.localLrcPath + platformHash + "/" + idHash + ".lrc",
            )
        ) {
            rawLrc = await RNFS.readFile(
                pathConst.localLrcPath + platformHash + "/" + idHash + ".lrc",
                "utf8",
            );

            if (
                await RNFS.exists(
                    pathConst.localLrcPath +
                    platformHash +
                    "/" +
                    idHash +
                    ".tran.lrc",
                )
            ) {
                translation =
                    (await RNFS.readFile(
                        pathConst.localLrcPath +
                        platformHash +
                        "/" +
                        idHash +
                        ".tran.lrc",
                        "utf8",
                    )) || null;
            }

            return {
                rawLrc,
                translation: translation || undefined, // TODO: 这里写的不好
            };
        }

        // 2. 缓存歌词 / 对象上本身的歌词
        if (musicItemCache?.lyric) {
            // 缓存的远程结果
            let cacheLyric: ILyric.ILyricSource | null =
                musicItemCache.lyric || null;
            // 缓存的本地结果
            let localLyric: ILyric.ILyricSource | null =
                musicItemCache.$localLyric || null;

            // 优先用缓存的结果
            if (cacheLyric.rawLrc || cacheLyric.translation) {
                return {
                    rawLrc: cacheLyric.rawLrc,
                    translation: cacheLyric.translation,
                };
            }

            // 本地其实是缓存的路径
            if (localLyric) {
                let needRefetch = false;
                if (localLyric.rawLrc && (await exists(localLyric.rawLrc))) {
                    rawLrc = await readFile(localLyric.rawLrc, "utf8");
                } else if (localLyric.rawLrc) {
                    needRefetch = true;
                }
                if (
                    localLyric.translation &&
                    (await exists(localLyric.translation))
                ) {
                    translation = await readFile(
                        localLyric.translation,
                        "utf8",
                    );
                } else if (localLyric.translation) {
                    needRefetch = true;
                }

                if (!needRefetch && (rawLrc || translation)) {
                    return {
                        rawLrc: rawLrc || undefined,
                        translation: translation || undefined,
                    };
                }
            }
        }

        // 3. 无缓存歌词/无自带歌词/无本地歌词
        let lrcSource: ILyric.ILyricSource | null;
        if (isSameMediaItem(originalMusicItem, musicItem)) {
            lrcSource =
                (await this.plugin.instance
                    ?.getLyric?.(resetMediaItem(musicItem, undefined, true))
                    ?.catch(() => null)) || null;
        } else {
            lrcSource =
                (await Plugin.pluginManager?.getByMedia(musicItem)
                    ?.instance?.getLyric?.(
                        resetMediaItem(musicItem, undefined, true),
                    )
                    ?.catch(() => null)) || null;
        }

        if (lrcSource) {
            rawLrc = lrcSource?.rawLrc || rawLrc;
            translation = lrcSource?.translation || null;

            const deprecatedLrcUrl = lrcSource?.lrc || musicItem.lrc;

            // 本地的文件名
            let filename: string | undefined = `${pathConst.lrcCachePath
            }${nanoid()}.lrc`;
            let filenameTrans: string | undefined = `${pathConst.lrcCachePath
            }${nanoid()}.lrc`;

            // 旧版本兼容
            if (!(rawLrc || translation)) {
                if (deprecatedLrcUrl) {
                    rawLrc = (
                        await axios
                            .get(deprecatedLrcUrl, { timeout: 3000 })
                            .catch(() => null)
                    )?.data;
                } else if (musicItem.rawLrc) {
                    rawLrc = musicItem.rawLrc;
                }
            }

            if (rawLrc) {
                await writeFile(filename, rawLrc, "utf8");
            } else {
                filename = undefined;
            }
            if (translation) {
                await writeFile(filenameTrans, translation, "utf8");
            } else {
                filenameTrans = undefined;
            }

            if (rawLrc || translation) {
                MediaCache.setMediaCache(
                    produce(musicItemCache || musicItem, draft => {
                        musicItemCache?.$localLyric?.rawLrc;
                        objectPath.set(draft, "$localLyric.rawLrc", filename);
                        objectPath.set(
                            draft,
                            "$localLyric.translation",
                            filenameTrans,
                        );
                        return draft;
                    }),
                );
                return {
                    rawLrc: rawLrc || undefined,
                    translation: translation || undefined,
                };
            }
        }

        // 6. 如果是本地文件
        const localFilePath = getLocalPath(originalMusicItem);
        if (
            originalMusicItem.platform !== localPluginPlatform &&
            localFilePath
        ) {
            const res = await localFilePluginDefine!.getLyric!(originalMusicItem);
            devLog("info", "本地文件歌词");

            if (res) {
                return res;
            }
        }
        devLog("warn", "无歌词");

        return null;
    }


    /** 获取专辑信息 */
    async getAlbumInfo(
        albumItem: IAlbum.IAlbumItemBase,
        page: number = 1,
    ): Promise<IPlugin.IAlbumInfoResult | null> {
        if (!this.plugin.instance.getAlbumInfo) {
            return {
                albumItem,
                musicList: (albumItem?.musicList ?? []).map(
                    resetMediaItem,
                    this.plugin.name,
                    true,
                ),
                isEnd: true,
            };
        }
        try {
            const result = await this.plugin.instance.getAlbumInfo(
                resetMediaItem(albumItem, undefined, true),
                page,
            );
            if (!result) {
                throw new Error();
            }
            result?.musicList?.forEach(_ => {
                resetMediaItem(_, this.plugin.name);
                _.album = albumItem.title;
            });

            if (page <= 1) {
                // 合并信息
                return {
                    albumItem: { ...albumItem, ...(result?.albumItem ?? {}) },
                    isEnd: result.isEnd === false ? false : true,
                    musicList: result.musicList,
                };
            } else {
                return {
                    isEnd: result.isEnd === false ? false : true,
                    musicList: result.musicList,
                };
            }
        } catch (e: any) {
            trace("获取专辑信息失败", e?.message);
            devLog("error", "获取专辑信息失败", e, e?.message);

            return null;
        }
    }

    /** 获取歌单信息 */
    async getMusicSheetInfo(
        sheetItem: IMusic.IMusicSheetItem,
        page: number = 1,
    ): Promise<IPlugin.ISheetInfoResult | null> {
        if (!this.plugin.instance.getMusicSheetInfo) {
            return {
                sheetItem,
                musicList: sheetItem?.musicList ?? [],
                isEnd: true,
            };
        }
        try {
            const result = await this.plugin.instance?.getMusicSheetInfo?.(
                resetMediaItem(sheetItem, undefined, true),
                page,
            );
            if (!result) {
                throw new Error();
            }
            result?.musicList?.forEach(_ => {
                resetMediaItem(_, this.plugin.name);
            });

            if (page <= 1) {
                // 合并信息
                return {
                    sheetItem: { ...sheetItem, ...(result?.sheetItem ?? {}) },
                    isEnd: result.isEnd === false ? false : true,
                    musicList: result.musicList,
                };
            } else {
                return {
                    isEnd: result.isEnd === false ? false : true,
                    musicList: result.musicList,
                };
            }
        } catch (e: any) {
            trace("获取歌单信息失败", e, e?.message);
            devLog("error", "获取歌单信息失败", e, e?.message);

            return null;
        }
    }

    /** 查询作者信息 */
    async getArtistWorks<T extends IArtist.ArtistMediaType>(
        artistItem: IArtist.IArtistItem,
        page: number,
        type: T,
    ): Promise<IPlugin.ISearchResult<T>> {
        if (!this.plugin.instance.getArtistWorks) {
            return {
                isEnd: true,
                data: [],
            };
        }
        try {
            const result = await this.plugin.instance.getArtistWorks(
                artistItem,
                page,
                type,
            );
            if (!result.data) {
                return {
                    isEnd: true,
                    data: [],
                };
            }
            result.data?.forEach(_ => resetMediaItem(_, this.plugin.name));
            return {
                isEnd: result.isEnd ?? true,
                data: result.data,
            };
        } catch (e: any) {
            trace("查询作者信息失败", e?.message);
            devLog("error", "查询作者信息失败", e, e?.message);

            throw e;
        }
    }

    /** 导入歌单 */
    async importMusicSheet(urlLike: string): Promise<IMusic.IMusicItem[]> {
        try {
            const result =
                (await this.plugin.instance?.importMusicSheet?.(urlLike)) ?? [];
            result.forEach(_ => resetMediaItem(_, this.plugin.name));
            return result;
        } catch (e: any) {
            console.log(e);
            devLog("error", "导入歌单失败", e, e?.message);

            return [];
        }
    }

    /** 导入单曲 */
    async importMusicItem(urlLike: string): Promise<IMusic.IMusicItem | null> {
        try {
            const result = await this.plugin.instance?.importMusicItem?.(
                urlLike,
            );
            if (!result) {
                throw new Error();
            }
            resetMediaItem(result, this.plugin.name);
            return result;
        } catch (e: any) {
            devLog("error", "导入单曲失败", e, e?.message);

            return null;
        }
    }

    /** 获取榜单 */
    async getTopLists(): Promise<IMusic.IMusicSheetGroupItem[]> {
        try {
            const result = await this.plugin.instance?.getTopLists?.();
            if (!result) {
                throw new Error();
            }
            return result;
        } catch (e: any) {
            devLog("error", "获取榜单失败", e, e?.message);
            return [];
        }
    }

    /** 获取榜单详情 */
    async getTopListDetail(
        topListItem: IMusic.IMusicSheetItemBase,
        page: number,
    ): Promise<IPlugin.ITopListInfoResult> {
        const result = await this.plugin.instance?.getTopListDetail?.(
            topListItem,
            page,
        );
        if (!result) {
            throw new Error();
        }
        if (result.musicList) {
            result.musicList.forEach(_ =>
                resetMediaItem(_, this.plugin.name),
            );
        } else {
            result.musicList = [];
        }
        if (result.isEnd !== false) {
            result.isEnd = true;
        }
        return result;
    }

    /** 获取推荐歌单的tag */
    async getRecommendSheetTags(): Promise<IPlugin.IGetRecommendSheetTagsResult> {
        try {
            const result =
                await this.plugin.instance?.getRecommendSheetTags?.();
            if (!result) {
                throw new Error();
            }
            return result;
        } catch (e: any) {
            devLog("error", "获取推荐歌单失败", e, e?.message);
            return {
                data: [],
            };
        }
    }

    /** 获取某个tag的推荐歌单 */
    async getRecommendSheetsByTag(
        tagItem: ICommon.IUnique,
        page?: number,
    ): Promise<ICommon.PaginationResponse<IMusic.IMusicSheetItemBase>> {
        try {
            const result =
                await this.plugin.instance?.getRecommendSheetsByTag?.(
                    tagItem,
                    page ?? 1,
                );
            if (!result) {
                throw new Error();
            }
            if (result.isEnd !== false) {
                result.isEnd = true;
            }
            if (!result.data) {
                result.data = [];
            }
            result.data.forEach(item => resetMediaItem(item, this.plugin.name));

            return result;
        } catch (e: any) {
            devLog("error", "获取推荐歌单详情失败", e, e?.message);
            return {
                isEnd: true,
                data: [],
            };
        }
    }

    async getMusicComments(
        musicItem: IMusic.IMusicItem,
        page?: number
    ): Promise<ICommon.PaginationResponse<IMedia.IComment>> {
        const result = await this.plugin.instance?.getMusicComments?.(
            musicItem,
            page ?? 1
        );
        if (!result) {
            throw new Error();
        }
        if (result.isEnd !== false) {
            result.isEnd = true;
        }
        if (!result.data) {
            result.data = [];
        }

        return result;
    }
}

//#region 插件类
export class Plugin {
    /** 插件名 */
    public name: string;
    /** 插件的hash，作为唯一id */
    public hash: string;
    /** 插件状态：激活、关闭、错误 */
    public state: PluginState = PluginState.Loading;
    /** 插件出错时的原因 */
    public errorReason?: PluginErrorReason;
    /** 插件的实例 */
    public instance: IPlugin.IPluginDefine;
    /** 插件路径 */
    public path: string;
    /** 插件方法 */
    public methods: IPlugin.IPluginInstanceMethods;


    static pluginManager: IPluginManager;

    static injectDependencies(
        pluginManager: IPluginManager,
    ) {
        Plugin.pluginManager = pluginManager;
    }

    constructor(
        funcCode: string | (() => IPlugin.IPluginDefine),
        pluginPath: string,
    ) {
        let _instance: IPlugin.IPluginDefine;

        const _module: any = { exports: {} };
        try {
            if (typeof funcCode === "string") {
                // 插件的环境变量
                const env = {
                    getUserVariables: () => {
                        return (
                            _internalPluginMeta.getUserVariables(this.name)
                        );
                    },
                    get userVariables() {
                        return this.getUserVariables() ?? {};
                    },
                    appVersion,
                    os: "android",
                    lang: "zh-CN",
                };
                const _process = {
                    platform: "android",
                    version: appVersion,
                    env,
                };

                // eslint-disable-next-line no-new-func
                _instance = Function(`
                    'use strict';
                    return function(require, __musicfree_require, module, exports, console, env, URL, process) {
                        ${funcCode}
                    }
                `)()(
                    _require,
                    _require,
                    _module,
                    _module.exports,
                    _console,
                    env,
                    URL,
                    _process
                );
                if (_module.exports.default) {
                    _instance = _module.exports
                        .default as IPlugin.IPluginInstance;
                } else {
                    _instance = _module.exports as IPlugin.IPluginInstance;
                }
            } else {
                _instance = funcCode();
            }
            // 插件初始化后的一些操作
            if (Array.isArray(_instance.userVariables)) {
                _instance.userVariables = _instance.userVariables.filter(
                    it => it?.key,
                );
            }
            this.checkValid(_instance);
        } catch (e: any) {
            this.state = PluginState.Error;
            this.errorReason = e?.errorReason ?? PluginErrorReason.CannotParse;

            errorLog(`${pluginPath}插件无法解析 `, {
                errorReason: this.errorReason,
                message: e?.message,
                stack: e?.stack,
            });
            _instance = e?.instance ?? {
                platform: "",
                appVersion: "",
                async getMediaSource() {
                    return null;
                },
                async search() {
                    return {};
                },
                async getAlbumInfo() {
                    return null;
                },
            };
        }

        this.instance = _instance;
        this.path = pluginPath;
        this.name = _instance.platform;

        // 检测name & 计算hash
        if (
            this.name === "" ||
            !this.name
        ) {
            this.hash = "";
            this.state = PluginState.Error;
            this.errorReason = this.errorReason ?? PluginErrorReason.CannotParse;
        } else {
            if (typeof funcCode === "string") {
                this.hash = sha256(funcCode).toString();
            } else {
                this.hash = sha256(pluginPath + "@" + appVersion).toString();
            }
        }


        if (this.state !== PluginState.Error) {
            this.state = PluginState.Mounted;
        }
        this.methods = new PluginMethodsWrapper(this);

    }

    private checkValid(_instance: IPlugin.IPluginDefine) {
        /** 版本号校验 */
        if (
            _instance.appVersion &&
            !satisfies(DeviceInfo.getVersion(), _instance.appVersion)
        ) {
            throw {
                instance: _instance,
                state: PluginState.Error,
                errorReason: PluginErrorReason.VersionNotMatch,
            };
        }
        return true;
    }
}


const localFilePluginDefine: IPlugin.IPluginDefine = {
    platform: localPluginPlatform,
    async getMusicInfo(musicBase) {
        const localPath = getLocalPath(musicBase);
        if (localPath) {
            const coverImg = await Mp3Util.getMediaCoverImg(localPath);
            return {
                artwork: coverImg,
            };
        }
        return null;
    },
    async getLyric(musicBase) {
        const localPath = getLocalPath(musicBase);
        let rawLrc: string | null = null;
        if (localPath) {
            // 读取内嵌歌词
            try {
                rawLrc = await Mp3Util.getLyric(localPath);
            } catch (e) {
                console.log("读取内嵌歌词失败", e);
            }
            if (!rawLrc) {
                // 读取配置歌词
                const lastDot = localPath.lastIndexOf(".");
                const lrcPath = localPath.slice(0, lastDot) + ".lrc";

                try {
                    if (await exists(lrcPath)) {
                        rawLrc = await readFile(lrcPath, "utf8");
                    }
                } catch { }
            }
        }

        return rawLrc
            ? {
                rawLrc,
            }
            : null;
    },
    async importMusicItem(urlLike) { // 绝对路径
        let meta: any = {};
        let id: string;

        try {
            meta = await Mp3Util.getBasicMeta(urlLike);
            const fileStat = await stat(urlLike);
            id =
                CryptoJs.MD5(fileStat.originalFilepath).toString(
                    CryptoJs.enc.Hex,
                ) || nanoid();
        } catch {
            id = nanoid();
        }

        return {
            id: id,
            platform: localPluginPlatform,
            title: meta?.title ?? getFileName(urlLike),
            artist: meta?.artist ?? "未知歌手",
            duration: parseInt(meta?.duration ?? "0", 10) / 1000,
            album: meta?.album ?? "未知专辑",
            artwork: "",
            [internalSerializeKey]: {
                localPath: urlLike,
            },
            url: urlLike,
        };
    },
    async getMediaSource(musicItem, quality) {
        if (quality === "standard") {
            return {
                url: addFileScheme(musicItem.$?.localPath || musicItem.url),
            };
        }
        return null;
    },

};

export const localFilePlugin = new Plugin(function () {
    return localFilePluginDefine;
}, "internal-plugin://local-file-plugin");

