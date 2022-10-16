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
import {ToastAndroid} from 'react-native';
import pathConst from '@/constants/pathConst';
import {compare, satisfies} from 'compare-versions';
import DeviceInfo from 'react-native-device-info';
import StateMapper from '@/utils/stateMapper';
import MediaMeta from './mediaMeta';
import {nanoid} from 'nanoid';
import {errorLog, trace} from '../utils/log';
import Cache from './cache';
import {
    getInternalData,
    InternalDataType,
    isSameMediaItem,
    resetMediaItem,
} from '@/utils/mediaItem';
import {CacheControl, internalSerializeKey} from '@/constants/commonConst';
import delay from '@/utils/delay';
import * as cheerio from 'cheerio';
import CookieManager from '@react-native-cookies/cookies';
import he from 'he';
import Network from './network';
import LocalMusicSheet from './localMusicSheet';
import {FileSystem} from 'react-native-file-access';

axios.defaults.timeout = 1500;

const sha256 = CryptoJs.SHA256;

export enum PluginStateCode {
    /** 版本不匹配 */
    VersionNotMatch = 'VERSION NOT MATCH',
    /** 无法解析 */
    CannotParse = 'CANNOT PARSE',
}

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

    constructor(funcCode: string, pluginPath: string) {
        this.state = 'enabled';
        let _instance: IPlugin.IPluginInstance;
        try {
            // eslint-disable-next-line no-new-func
            _instance = Function(`
      'use strict';
      try {
        return ${funcCode};
      } catch(e) {
        return null;
      }
    `)()({
                CryptoJs,
                axios,
                dayjs,
                cheerio,
                bigInt,
                qs,
                he,
                CookieManager: {
                    flush: CookieManager.flush,
                    get: CookieManager.get,
                },
            });
            this.checkValid(_instance);
        } catch (e: any) {
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
        if (this.instance.platform === '') {
            this.hash = '';
        } else {
            this.hash = sha256(funcCode).toString();
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
        retryCount = 1,
    ): Promise<IPlugin.IMediaSourceResult> {
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
        // 2. 缓存播放
        const mediaCache = Cache.get(musicItem);
        const pluginCacheControl = this.plugin.instance.cacheControl;
        if (
            mediaCache &&
            mediaCache?.url &&
            (pluginCacheControl === CacheControl.Cache ||
                (pluginCacheControl === CacheControl.NoCache &&
                    Network.isOffline()))
        ) {
            trace('播放', '缓存播放');
            return {
                url: mediaCache.url,
                headers: mediaCache.headers,
                userAgent:
                    mediaCache.userAgent ?? mediaCache.headers?.['user-agent'],
            };
        }
        // 3. 插件解析
        if (!this.plugin.instance.getMediaSource) {
            return {url: musicItem.url};
        }
        try {
            const {url, headers} =
                (await this.plugin.instance.getMediaSource(musicItem)) ?? {};
            if (!url) {
                throw new Error();
            }
            trace('播放', '插件播放');
            const result = {
                url,
                headers,
                userAgent: headers?.['user-agent'],
            } as IPlugin.IMediaSourceResult;

            if (pluginCacheControl !== CacheControl.NoStore) {
                Cache.update(musicItem, result);
            }

            return result;
        } catch (e: any) {
            if (retryCount > 0) {
                await delay(150);
                return this.getMediaSource(musicItem, --retryCount);
            }
            errorLog('获取真实源失败', e?.message);
            throw e;
        }
    }

    /** 获取音乐详情 */
    async getMusicInfo(
        musicItem: ICommon.IMediaBase,
    ): Promise<IMusic.IMusicItem | null> {
        if (!this.plugin.instance.getMusicInfo) {
            return musicItem as IMusic.IMusicItem;
        }
        return (
            this.plugin.instance.getMusicInfo(
                resetMediaItem(musicItem, undefined, true),
            ) ?? musicItem
        );
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
                rawLrc = (await axios.get(lrcUrl, {timeout: 1500})).data;
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
            }
        }
        // 5. 最后一次请求
        if (rawLrc || lrcUrl) {
            const filename = `${pathConst.lrcCachePath}${nanoid()}.lrc`;
            if (lrcUrl) {
                try {
                    rawLrc = (await axios.get(lrcUrl, {timeout: 1500})).data;
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
    ): Promise<IAlbum.IAlbumItem | null> {
        if (!this.plugin.instance.getAlbumInfo) {
            return {...albumItem, musicList: []};
        }
        try {
            const result = await this.plugin.instance.getAlbumInfo(
                resetMediaItem(albumItem, undefined, true),
            );
            if (!result) {
                throw new Error();
            }
            result?.musicList?.forEach(_ => {
                resetMediaItem(_, this.plugin.name);
            });

            return {...albumItem, ...result};
        } catch (e) {
            return {...albumItem, musicList: []};
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
        } catch (e) {
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
        } catch (e) {
            console.log(e);
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
        } catch {
            return null;
        }
    }
}

let plugins: Array<Plugin> = [];
const pluginStateMapper = new StateMapper(() => plugins);
const localFilePlugin = new Plugin(
    `function (){
    return {
        platform: '本地',
    }
}`,
    '',
);

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
    if (pluginPath.endsWith('.js')) {
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
    }
    throw new Error('插件不存在');
}

async function installPluginFromUrl(url: string) {
    try {
        const funcCode = (await axios.get(url)).data;
        if (funcCode) {
            const plugin = new Plugin(funcCode, '');
            const _pluginIndex = plugins.findIndex(p => p.hash === plugin.hash);
            if (_pluginIndex !== -1) {
                throw new Error('插件已安装');
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
            throw new Error('插件无法解析');
        }
    } catch (e: any) {
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
    return getByName(mediaItem.platform);
}

function getByHash(hash: string) {
    return plugins.find(_ => _.hash === hash);
}

function getByName(name: string) {
    return name === '本地'
        ? localFilePlugin
        : plugins.find(_ => _.name === name);
}

function getValidPlugins() {
    return plugins.filter(_ => _.state === 'enabled');
}

function getSearchablePlugins() {
    return plugins.filter(_ => _.state === 'enabled' && _.instance.search);
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
    usePlugins: pluginStateMapper.useMappedState,
    uninstallAllPlugins,
};

export default PluginManager;
