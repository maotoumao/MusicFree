import {
    copyFile,
    exists,
    readDir,
    readFile,
    unlink,
    writeFile,
} from 'react-native-fs';
import CryptoJs from 'crypto-js';
import dayjs from 'dayjs';
import axios from 'axios';
import bigInt from 'big-integer';
import qs from 'qs';
import {InteractionManager, ToastAndroid} from 'react-native';
import pathConst from '@/constants/pathConst';
import {compare, satisfies} from 'compare-versions';
import DeviceInfo from 'react-native-device-info';
import StateMapper from '@/utils/stateMapper';
import MediaMeta from './mediaMeta';
import {nanoid} from 'nanoid';
import {devLog, errorLog, trace} from '../utils/log';
import Cache from './cache';
import {
    getInternalData,
    InternalDataType,
    isSameMediaItem,
    resetMediaItem,
} from '@/utils/mediaItem';
import {
    CacheControl,
    emptyFunction,
    internalSerializeKey,
    localPluginHash,
    localPluginPlatform,
} from '@/constants/commonConst';
import delay from '@/utils/delay';
import * as cheerio from 'cheerio';
import CookieManager from '@react-native-cookies/cookies';
import he from 'he';
import Network from './network';
import LocalMusicSheet from './localMusicSheet';
import {FileSystem} from 'react-native-file-access';
import Mp3Util from '@/native/mp3Util';
import {PluginMeta} from './pluginMeta';
import {useEffect, useState} from 'react';

axios.defaults.timeout = 2000;

const sha256 = CryptoJs.SHA256;

export enum PluginStateCode {
    /** 版本不匹配 */
    VersionNotMatch = 'VERSION NOT MATCH',
    /** 无法解析 */
    CannotParse = 'CANNOT PARSE',
}

const packages: Record<string, any> = {
    cheerio,
    'crypto-js': CryptoJs,
    axios,
    dayjs,
    'big-integer': bigInt,
    qs,
    he,
    '@react-native-cookies/cookies': CookieManager,
};

const _require = (packageName: string) => {
    let pkg = packages[packageName];
    pkg.default = pkg;
    return pkg;
};

const _consoleBind = function (
    method: 'log' | 'error' | 'info' | 'warn',
    ...args: any
) {
    const fn = console[method];
    if (fn) {
        fn(...args);
        devLog(method, ...args);
    }
};

const _console = {
    log: _consoleBind.bind(null, 'log'),
    warn: _consoleBind.bind(null, 'warn'),
    info: _consoleBind.bind(null, 'info'),
    error: _consoleBind.bind(null, 'error'),
};

//#region 插件类
export class Plugin {
    /** 插件名 */
    public name: string;
    /** 插件的hash，作为唯一id */
    public hash: string;
    /** 插件状态：激活、关闭、错误 */
    public state: 'enabled' | 'disabled' | 'error';
    /** 插件支持的搜索类型 */
    public supportedSearchType?: string;
    /** 插件状态信息 */
    public stateCode?: PluginStateCode;
    /** 插件的实例 */
    public instance: IPlugin.IPluginInstance;
    /** 插件路径 */
    public path: string;
    /** 插件方法 */
    public methods: PluginMethods;
    /** TODO 用户输入 */
    public userEnv?: Record<string, string>;

    constructor(
        funcCode: string | (() => IPlugin.IPluginInstance),
        pluginPath: string,
    ) {
        this.state = 'enabled';
        let _instance: IPlugin.IPluginInstance;
        const _module: any = {exports: {}};
        try {
            if (typeof funcCode === 'string') {
                // eslint-disable-next-line no-new-func
                _instance = Function(`
                    'use strict';
                    return function(require, __musicfree_require, module, exports, console) {
                        ${funcCode}
                    }
                `)()(_require, _require, _module, _module.exports, _console);
                if (_module.exports.default) {
                    _instance = _module.exports
                        .default as IPlugin.IPluginInstance;
                } else {
                    _instance = _module.exports as IPlugin.IPluginInstance;
                }
            } else {
                _instance = funcCode();
            }
            this.checkValid(_instance);
        } catch (e: any) {
            console.log(e);
            this.state = 'error';
            this.stateCode = PluginStateCode.CannotParse;
            if (e?.stateCode) {
                this.stateCode = e.stateCode;
            }
            errorLog(`${pluginPath}插件无法解析 `, {
                stateCode: this.stateCode,
                message: e?.message,
                stack: e?.stack,
            });
            _instance = e?.instance ?? {
                _path: '',
                platform: '',
                appVersion: '',
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
        if (
            this.instance.platform === '' ||
            this.instance.platform === undefined
        ) {
            this.hash = '';
        } else {
            if (typeof funcCode === 'string') {
                this.hash = sha256(funcCode).toString();
            } else {
                this.hash = sha256(funcCode.toString()).toString();
            }
        }

        // 放在最后
        this.methods = new PluginMethods(this);
    }

    private checkValid(_instance: IPlugin.IPluginInstance) {
        /** 版本号校验 */
        if (
            _instance.appVersion &&
            !satisfies(DeviceInfo.getVersion(), _instance.appVersion)
        ) {
            throw {
                instance: _instance,
                stateCode: PluginStateCode.VersionNotMatch,
            };
        }
        return true;
    }
}
//#endregion

//#region 基于插件类封装的方法，供给APP侧直接调用
/** 有缓存等信息 */
class PluginMethods implements IPlugin.IPluginInstanceMethods {
    private plugin;
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
        quality: IMusic.IQualityKey = 'standard',
        retryCount = 1,
        notUpdateCache = false,
    ): Promise<IPlugin.IMediaSourceResult | null> {
        // 1. 本地搜索 其实直接读mediameta就好了
        const localPath =
            getInternalData<string>(musicItem, InternalDataType.LOCALPATH) ??
            getInternalData<string>(
                LocalMusicSheet.isLocalMusic(musicItem),
                InternalDataType.LOCALPATH,
            );
        if (localPath && (await FileSystem.exists(localPath))) {
            trace('本地播放', localPath);
            return {
                url: localPath,
            };
        }
        if (musicItem.platform === localPluginPlatform) {
            throw new Error('本地音乐不存在');
        }
        // 2. 缓存播放
        const mediaCache = Cache.get(musicItem);
        const pluginCacheControl =
            this.plugin.instance.cacheControl ?? 'no-cache';
        if (
            mediaCache &&
            mediaCache?.qualities?.[quality]?.url &&
            (pluginCacheControl === CacheControl.Cache ||
                (pluginCacheControl === CacheControl.NoCache &&
                    Network.isOffline()))
        ) {
            trace('播放', '缓存播放');
            const qualityInfo = mediaCache.qualities[quality];
            return {
                url: qualityInfo.url,
                headers: mediaCache.headers,
                userAgent:
                    mediaCache.userAgent ?? mediaCache.headers?.['user-agent'],
            };
        }
        // 3. 插件解析
        if (!this.plugin.instance.getMediaSource) {
            return {url: musicItem?.qualities?.[quality]?.url ?? musicItem.url};
        }
        try {
            const {url, headers} = (await this.plugin.instance.getMediaSource(
                musicItem,
                quality,
            )) ?? {url: musicItem?.qualities?.[quality]?.url};
            if (!url) {
                throw new Error('NOT RETRY');
            }
            trace('播放', '插件播放');
            const result = {
                url,
                headers,
                userAgent: headers?.['user-agent'],
            } as IPlugin.IMediaSourceResult;

            if (
                pluginCacheControl !== CacheControl.NoStore &&
                !notUpdateCache
            ) {
                Cache.update(musicItem, [
                    ['headers', result.headers],
                    ['userAgent', result.userAgent],
                    [`qualities.${quality}.url`, url],
                ]);
            }

            return result;
        } catch (e: any) {
            if (retryCount > 0 && e?.message !== 'NOT RETRY') {
                await delay(150);
                return this.getMediaSource(musicItem, quality, --retryCount);
            }
            errorLog('获取真实源失败', e?.message);
            devLog('error', '获取真实源失败', e, e?.message);
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
            devLog('error', '获取音乐详情失败', e, e?.message);
            return null;
        }
    }

    /** 获取歌词 */
    async getLyric(
        musicItem: IMusic.IMusicItemBase,
        from?: IMusic.IMusicItemBase,
    ): Promise<ILyric.ILyricSource | null> {
        // 1.额外存储的meta信息
        const meta = MediaMeta.get(musicItem);
        if (meta && meta.associatedLrc) {
            // 有关联歌词
            if (
                isSameMediaItem(musicItem, from) ||
                isSameMediaItem(meta.associatedLrc, musicItem)
            ) {
                // 形成环路，断开当前的环
                await MediaMeta.update(musicItem, {
                    associatedLrc: undefined,
                });
                // 无歌词
                return null;
            }
            // 获取关联歌词
            const associatedMeta = MediaMeta.get(meta.associatedLrc) ?? {};
            const result = await this.getLyric(
                {...meta.associatedLrc, ...associatedMeta},
                from ?? musicItem,
            );
            if (result) {
                // 如果有关联歌词，就返回关联歌词，深度优先
                return result;
            }
        }
        const cache = Cache.get(musicItem);
        let rawLrc = meta?.rawLrc || musicItem.rawLrc || cache?.rawLrc;
        let lrcUrl = meta?.lrc || musicItem.lrc || cache?.lrc;
        // 如果存在文本
        if (rawLrc) {
            return {
                rawLrc,
                lrc: lrcUrl,
            };
        }
        // 2.本地缓存
        const localLrc =
            meta?.[internalSerializeKey]?.local?.localLrc ||
            cache?.[internalSerializeKey]?.local?.localLrc;
        if (localLrc && (await exists(localLrc))) {
            rawLrc = await readFile(localLrc, 'utf8');
            return {
                rawLrc,
                lrc: lrcUrl,
            };
        }
        // 3.优先使用url
        if (lrcUrl) {
            try {
                // 需要超时时间 axios timeout 但是没生效
                rawLrc = (await axios.get(lrcUrl, {timeout: 2000})).data;
                return {
                    rawLrc,
                    lrc: lrcUrl,
                };
            } catch {
                lrcUrl = undefined;
            }
        }
        // 4. 如果地址失效
        if (!lrcUrl) {
            // 插件获得url
            try {
                let lrcSource;
                if (from) {
                    lrcSource = await PluginManager.getByMedia(
                        musicItem,
                    )?.instance?.getLyric?.(
                        resetMediaItem(musicItem, undefined, true),
                    );
                } else {
                    lrcSource = await this.plugin.instance?.getLyric?.(
                        resetMediaItem(musicItem, undefined, true),
                    );
                }

                rawLrc = lrcSource?.rawLrc;
                lrcUrl = lrcSource?.lrc;
            } catch (e: any) {
                trace('插件获取歌词失败', e?.message, 'error');
                devLog('error', '插件获取歌词失败', e, e?.message);
            }
        }
        // 5. 最后一次请求
        if (rawLrc || lrcUrl) {
            const filename = `${pathConst.lrcCachePath}${nanoid()}.lrc`;
            if (lrcUrl) {
                try {
                    rawLrc = (await axios.get(lrcUrl, {timeout: 2000})).data;
                } catch {}
            }
            if (rawLrc) {
                await writeFile(filename, rawLrc, 'utf8');
                // 写入缓存
                Cache.update(musicItem, [
                    [`${internalSerializeKey}.local.localLrc`, filename],
                ]);
                // 如果有meta
                if (meta) {
                    MediaMeta.update(musicItem, [
                        [`${internalSerializeKey}.local.localLrc`, filename],
                    ]);
                }
                return {
                    rawLrc,
                    lrc: lrcUrl,
                };
            }
        }
        // 6. 如果是本地文件
        const isDownloaded = LocalMusicSheet.isLocalMusic(musicItem);
        if (musicItem.platform !== localPluginPlatform && isDownloaded) {
            const res = await localFilePlugin.instance!.getLyric!(isDownloaded);
            if (res) {
                return res;
            }
        }
        devLog('warn', '无歌词');

        return null;
    }

    /** 获取歌词文本 */
    async getLyricText(
        musicItem: IMusic.IMusicItem,
    ): Promise<string | undefined> {
        return (await this.getLyric(musicItem))?.rawLrc;
    }

    /** 获取专辑信息 */
    async getAlbumInfo(
        albumItem: IAlbum.IAlbumItemBase,
        page: number = 1,
    ): Promise<IPlugin.IAlbumInfoResult | null> {
        if (!this.plugin.instance.getAlbumInfo) {
            return {
                albumItem,
                musicList: albumItem?.musicList ?? [],
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
                    albumItem: {...albumItem, ...(result?.albumItem ?? {})},
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
            trace('获取专辑信息失败', e?.message);
            devLog('error', '获取专辑信息失败', e, e?.message);

            return null;
        }
    }

    /** 获取歌单信息 */
    async getMusicSheetInfo(
        sheetItem: IMusic.IMusicSheetItem,
        page: number = 1,
    ): Promise<IPlugin.ISheetInfoResult | null> {
        if (!this.plugin.instance.getAlbumInfo) {
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
                    sheetItem: {...sheetItem, ...(result?.sheetItem ?? {})},
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
            trace('获取歌单信息失败', e, e?.message);
            devLog('error', '获取歌单信息失败', e, e?.message);

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
            trace('查询作者信息失败', e?.message);
            devLog('error', '查询作者信息失败', e, e?.message);

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
            devLog('error', '导入歌单失败', e, e?.message);

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
            devLog('error', '导入单曲失败', e, e?.message);

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
            devLog('error', '获取榜单失败', e, e?.message);
            return [];
        }
    }
    /** 获取榜单详情 */
    async getTopListDetail(
        topListItem: IMusic.IMusicSheetItemBase,
    ): Promise<ICommon.WithMusicList<IMusic.IMusicSheetItemBase>> {
        try {
            const result = await this.plugin.instance?.getTopListDetail?.(
                topListItem,
            );
            if (!result) {
                throw new Error();
            }
            if (result.musicList) {
                result.musicList.forEach(_ =>
                    resetMediaItem(_, this.plugin.name),
                );
            }
            return result;
        } catch (e: any) {
            devLog('error', '获取榜单详情失败', e, e?.message);
            return {
                ...topListItem,
                musicList: [],
            };
        }
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
            devLog('error', '获取推荐歌单失败', e, e?.message);
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
            devLog('error', '获取推荐歌单详情失败', e, e?.message);
            return {
                isEnd: true,
                data: [],
            };
        }
    }
}
//#endregion

let plugins: Array<Plugin> = [];
const pluginStateMapper = new StateMapper(() => plugins);

//#region 本地音乐插件
/** 本地插件 */
const localFilePlugin = new Plugin(function () {
    return {
        platform: localPluginPlatform,
        _path: '',
        async getMusicInfo(musicBase) {
            const localPath = getInternalData<string>(
                musicBase,
                InternalDataType.LOCALPATH,
            );
            if (localPath) {
                const coverImg = await Mp3Util.getMediaCoverImg(localPath);
                return {
                    artwork: coverImg,
                };
            }
            return null;
        },
        async getLyric(musicBase) {
            const localPath = getInternalData<string>(
                musicBase,
                InternalDataType.LOCALPATH,
            );
            let rawLrc: string | null = null;
            if (localPath) {
                // 读取内嵌歌词
                try {
                    rawLrc = await Mp3Util.getLyric(localPath);
                } catch (e) {
                    console.log('e', e);
                }
                if (!rawLrc) {
                    // 读取配置歌词
                    const lastDot = localPath.lastIndexOf('.');
                    const lrcPath = localPath.slice(0, lastDot) + '.lrc';

                    try {
                        if (await exists(lrcPath)) {
                            rawLrc = await readFile(lrcPath, 'utf8');
                        }
                    } catch {}
                }
            }

            return rawLrc
                ? {
                      rawLrc,
                  }
                : null;
        },
    };
}, '');
localFilePlugin.hash = localPluginHash;

//#endregion

async function setup() {
    const _plugins: Array<Plugin> = [];
    try {
        // 加载插件
        const pluginsPaths = await readDir(pathConst.pluginPath);
        for (let i = 0; i < pluginsPaths.length; ++i) {
            const _pluginUrl = pluginsPaths[i];
            trace('初始化插件', _pluginUrl);
            if (
                _pluginUrl.isFile() &&
                (_pluginUrl.name?.endsWith?.('.js') ||
                    _pluginUrl.path?.endsWith?.('.js'))
            ) {
                const funcCode = await readFile(_pluginUrl.path, 'utf8');
                const plugin = new Plugin(funcCode, _pluginUrl.path);
                const _pluginIndex = _plugins.findIndex(
                    p => p.hash === plugin.hash,
                );
                if (_pluginIndex !== -1) {
                    // 重复插件，直接忽略
                    return;
                }
                plugin.hash !== '' && _plugins.push(plugin);
            }
        }

        plugins = _plugins;
        pluginStateMapper.notify();
        /** 初始化meta信息 */
        PluginMeta.setupMeta(plugins.map(_ => _.name));
    } catch (e: any) {
        ToastAndroid.show(
            `插件初始化失败:${e?.message ?? e}`,
            ToastAndroid.LONG,
        );
        errorLog('插件初始化失败', e?.message);
        throw e;
    }
}

// 安装插件
async function installPlugin(pluginPath: string) {
    // if (pluginPath.endsWith('.js')) {
    const funcCode = await readFile(pluginPath, 'utf8');
    const plugin = new Plugin(funcCode, pluginPath);
    const _pluginIndex = plugins.findIndex(p => p.hash === plugin.hash);
    if (_pluginIndex !== -1) {
        throw new Error('插件已安装');
    }
    if (plugin.hash !== '') {
        const fn = nanoid();
        const _pluginPath = `${pathConst.pluginPath}${fn}.js`;
        await copyFile(pluginPath, _pluginPath);
        plugin.path = _pluginPath;
        plugins = plugins.concat(plugin);
        pluginStateMapper.notify();
        return;
    }
    throw new Error('插件无法解析');
    // }
    // throw new Error('插件不存在');
}

async function installPluginFromUrl(url: string) {
    try {
        const funcCode = (await axios.get(url)).data;
        if (funcCode) {
            const plugin = new Plugin(funcCode, '');
            const _pluginIndex = plugins.findIndex(p => p.hash === plugin.hash);
            if (_pluginIndex !== -1) {
                // 静默忽略
                return;
            }
            const oldVersionPlugin = plugins.find(p => p.name === plugin.name);
            if (oldVersionPlugin) {
                if (
                    compare(
                        oldVersionPlugin.instance.version ?? '',
                        plugin.instance.version ?? '',
                        '>',
                    )
                ) {
                    throw new Error('已安装更新版本的插件');
                }
            }

            if (plugin.hash !== '') {
                const fn = nanoid();
                const _pluginPath = `${pathConst.pluginPath}${fn}.js`;
                await writeFile(_pluginPath, funcCode, 'utf8');
                plugin.path = _pluginPath;
                plugins = plugins.concat(plugin);
                if (oldVersionPlugin) {
                    plugins = plugins.filter(
                        _ => _.hash !== oldVersionPlugin.hash,
                    );
                    try {
                        await unlink(oldVersionPlugin.path);
                    } catch {}
                }
                pluginStateMapper.notify();
                return;
            }
            throw new Error('插件无法解析!');
        }
    } catch (e: any) {
        devLog('error', 'URL安装插件失败', e, e?.message);
        errorLog('URL安装插件失败', e);
        throw new Error(e?.message ?? '');
    }
}

/** 卸载插件 */
async function uninstallPlugin(hash: string) {
    const targetIndex = plugins.findIndex(_ => _.hash === hash);
    if (targetIndex !== -1) {
        try {
            const pluginName = plugins[targetIndex].name;
            await unlink(plugins[targetIndex].path);
            plugins = plugins.filter(_ => _.hash !== hash);
            pluginStateMapper.notify();
            if (plugins.every(_ => _.name !== pluginName)) {
                await MediaMeta.removePlugin(pluginName);
            }
        } catch {}
    }
}

async function uninstallAllPlugins() {
    await Promise.all(
        plugins.map(async plugin => {
            try {
                const pluginName = plugin.name;
                await unlink(plugin.path);
                await MediaMeta.removePlugin(pluginName);
            } catch (e) {}
        }),
    );
    plugins = [];
    pluginStateMapper.notify();

    /** 清除空余文件，异步做就可以了 */
    readDir(pathConst.pluginPath)
        .then(fns => {
            fns.forEach(fn => {
                unlink(fn.path).catch(emptyFunction);
            });
        })
        .catch(emptyFunction);
}

async function updatePlugin(plugin: Plugin) {
    const updateUrl = plugin.instance.srcUrl;
    if (!updateUrl) {
        throw new Error('没有更新源');
    }
    try {
        await installPluginFromUrl(updateUrl);
    } catch (e: any) {
        if (e.message === '插件已安装') {
            throw new Error('当前已是最新版本');
        } else {
            throw e;
        }
    }
}

function getByMedia(mediaItem: ICommon.IMediaBase) {
    return getByName(mediaItem?.platform);
}

function getByHash(hash: string) {
    return hash === localPluginHash
        ? localFilePlugin
        : plugins.find(_ => _.hash === hash);
}

function getByName(name: string) {
    return name === localPluginPlatform
        ? localFilePlugin
        : plugins.find(_ => _.name === name);
}

function getValidPlugins() {
    return plugins.filter(_ => _.state === 'enabled');
}

function getSearchablePlugins() {
    return plugins.filter(_ => _.state === 'enabled' && _.instance.search);
}

function getSortedSearchablePlugins() {
    return getSearchablePlugins().sort((a, b) =>
        (PluginMeta.getPluginMeta(a).order ?? Infinity) -
            (PluginMeta.getPluginMeta(b).order ?? Infinity) <
        0
            ? -1
            : 1,
    );
}

function getTopListsablePlugins() {
    return plugins.filter(_ => _.state === 'enabled' && _.instance.getTopLists);
}

function getSortedTopListsablePlugins() {
    return getTopListsablePlugins().sort((a, b) =>
        (PluginMeta.getPluginMeta(a).order ?? Infinity) -
            (PluginMeta.getPluginMeta(b).order ?? Infinity) <
        0
            ? -1
            : 1,
    );
}

function getRecommendSheetablePlugins() {
    return plugins.filter(
        _ => _.state === 'enabled' && _.instance.getRecommendSheetsByTag,
    );
}

function getSortedRecommendSheetablePlugins() {
    return getRecommendSheetablePlugins().sort((a, b) =>
        (PluginMeta.getPluginMeta(a).order ?? Infinity) -
            (PluginMeta.getPluginMeta(b).order ?? Infinity) <
        0
            ? -1
            : 1,
    );
}

function useSortedPlugins() {
    const _plugins = pluginStateMapper.useMappedState();
    const _pluginMetaAll = PluginMeta.usePluginMetaAll();

    const [sortedPlugins, setSortedPlugins] = useState(
        [..._plugins].sort((a, b) =>
            (_pluginMetaAll[a.name]?.order ?? Infinity) -
                (_pluginMetaAll[b.name]?.order ?? Infinity) <
            0
                ? -1
                : 1,
        ),
    );

    useEffect(() => {
        InteractionManager.runAfterInteractions(() => {
            setSortedPlugins(
                [..._plugins].sort((a, b) =>
                    (_pluginMetaAll[a.name]?.order ?? Infinity) -
                        (_pluginMetaAll[b.name]?.order ?? Infinity) <
                    0
                        ? -1
                        : 1,
                ),
            );
        });
    }, [_plugins, _pluginMetaAll]);

    return sortedPlugins;
}

const PluginManager = {
    setup,
    installPlugin,
    installPluginFromUrl,
    updatePlugin,
    uninstallPlugin,
    getByMedia,
    getByHash,
    getByName,
    getValidPlugins,
    getSearchablePlugins,
    getSortedSearchablePlugins,
    getTopListsablePlugins,
    getSortedRecommendSheetablePlugins,
    getSortedTopListsablePlugins,
    usePlugins: pluginStateMapper.useMappedState,
    useSortedPlugins,
    uninstallAllPlugins,
};

export default PluginManager;
