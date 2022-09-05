import RNFS, {exists, readFile, writeFile} from 'react-native-fs';
import CryptoJs from 'crypto-js';
import dayjs from 'dayjs';
import axios from 'axios';
import {useEffect, useState} from 'react';
import {ToastAndroid} from 'react-native';
import pathConst from '@/constants/pathConst';
import {satisfies} from 'compare-versions';
import DeviceInfo from 'react-native-device-info';
import StateMapper from '@/utils/stateMapper';
import MediaMetaManager from './mediaMetaManager';
import {nanoid} from 'nanoid';
import isSameMusicItem from '@/utils/isSameMusicItem';
import {errorLog, trace} from './logManager';

axios.defaults.timeout = 1500;

const sha256 = CryptoJs.SHA256;

enum PluginStateCode {
  /** 版本不匹配 */
  VersionNotMatch = 'VERSION NOT MATCH',
  /** 插件不完整 */
  NotComplete = 'NOT COMPLETE',
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

  constructor(funcCode: string, pluginPath: string) {
    this.state = 'enabled';
    let _instance: IPlugin.IPluginInstance;
    try {
      _instance = Function(`
      'use strict';
      try {
        return ${funcCode};
      } catch(e) {
        return null;
      }
    `)()({CryptoJs, axios, dayjs});

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
        async getMusicTrack() {
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
    this.instance._path = pluginPath;
    this.name = _instance.platform;
    if (this.instance.platform === '') {
      this.hash = '';
    } else {
      this.hash = sha256(funcCode).toString();
    }
  }

  private checkValid(_instance: IPlugin.IPluginInstance) {
    // 总不会一个都没有吧
    const keys: Array<keyof IPlugin.IPluginInstance> = [
      'getAlbumInfo',
      'search',
      'getMusicTrack',
    ];
    if (keys.every(k => !_instance[k])) {
      throw {
        instance: _instance,
        stateCode: PluginStateCode.NotComplete,
      };
    }
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

class PluginManager {
  private plugins: Array<Plugin> = [];
  loading: boolean = true;
  /** 插件安装位置 */
  pluginPath: string = pathConst.pluginPath;
  constructor() {}

  private loadPlugin(funcCode: string, pluginPath: string) {
    const plugin = new Plugin(funcCode, pluginPath);
    const _pluginIndex = this.plugins.findIndex(p => p.hash === plugin.hash);
    if (_pluginIndex !== -1) {
      // 有重复的了，直接忽略
      return;
    }
    plugin.hash !== '' && this.plugins.push(plugin);
  }

  getPlugins() {
    return this.plugins;
  }

  getValidPlugins() {
    return this.plugins.filter(_ => _.state === 'enabled');
  }

  getPlugin(platform: string) {
    return this.plugins.find(
      _ => _.instance.platform === platform && _.state === 'enabled',
    );
  }

  getPluginByPlatform(platform: string) {
    return this.plugins.filter(_ => _.name === platform);
  }

  getPluginByHash(hash: string) {
    return this.plugins.find(_ => _.hash === hash);
  }

  async setupPlugins() {
    this.loading = true;
    this.plugins = [];
    try {
      this.loading = false;
      // 加载插件
      const pluginsPaths = await RNFS.readDir(pathConst.pluginPath);
      for (let i = 0; i < pluginsPaths.length; ++i) {
        const _plugin = pluginsPaths[i];

        if (_plugin.isFile() && _plugin.name.endsWith('.js')) {
          const funcCode = await RNFS.readFile(_plugin.path, 'utf8');
          this.loadPlugin(funcCode, _plugin.path);
        }
      }
      this.loading = false;
    } catch (e: any) {
      ToastAndroid.show(`插件初始化失败:${e?.message ?? e}`, ToastAndroid.LONG);
      this.loading = false;
      throw e;
    }
  }
}

const pluginManager = new PluginManager();

function usePlugins() {
  const [plugins, setPlugins] = useState(pluginManager.getValidPlugins());

  useEffect(() => {
    if (pluginManager.loading === false) {
      setPlugins(pluginManager.getValidPlugins());
    }
  }, [pluginManager.loading]);

  return plugins;
}

/** 封装的插件方法 */
const pluginMethod = {
  async getLyric(
    musicItem: IMusic.IMusicItem,
    from?: IMusic.IMusicItem,
  ): Promise<string | undefined> {
    const meta = MediaMetaManager.getMediaMeta(musicItem) ?? {};
    if (meta.associatedLrc) {
      if (
        isSameMusicItem(musicItem, from) ||
        isSameMusicItem(meta.associatedLrc, musicItem)
      ) {
        // 形成了环 只把自己断开
        await MediaMetaManager.updateMediaMeta(musicItem, {
          associatedLrc: undefined,
        });
        return;
      }
      const result = await pluginMethod.getLyric(
        meta.associatedLrc as IMusic.IMusicItem,
        from ?? musicItem,
      );
      if (result) {
        return result;
      }
    }
    if (meta?.rawLrc || musicItem.rawLrc) {
      return meta.rawLrc ?? musicItem.rawLrc;
    }
    if (meta.localLrc && (await exists(meta.localLrc))) {
      return await readFile(meta.localLrc, 'utf8');
    }
    let lrcUrl: string | undefined = meta?.lrc ?? musicItem.lrc;
    let rawLrc: string | undefined;
    if (lrcUrl) {
      try {
        // 需要超时时间 axios timeout 但是没生效
        rawLrc = (await axios.get(lrcUrl)).data;
      } catch {
        lrcUrl = undefined;
      }
    }
    if (!lrcUrl) {
      const plugin = pluginManager.getPlugin(musicItem.platform);
      try {
        const lrcSource = await plugin?.instance?.getLyric?.(musicItem);
        rawLrc = lrcSource?.rawLrc;
        lrcUrl = lrcSource?.lrc;
      } catch (e: any) {
        trace('插件获取失败', e?.message, 'error');
      }
    }
    if (rawLrc || lrcUrl) {
      const filename = `${pathConst.lrcCachePath}${nanoid()}.lrc`;
      if (rawLrc) {
        await writeFile(filename, rawLrc, 'utf8');
        MediaMetaManager.updateMediaMeta(musicItem, {
          localLrc: filename,
        });
        return rawLrc;
      }
      if (lrcUrl) {
        try {
          const content = (await axios.get(lrcUrl)).data;
          await writeFile(filename, content, 'utf8');
          MediaMetaManager.updateMediaMeta(musicItem, {
            localLrc: filename,
            lrc: lrcUrl,
          });
          return content;
        } catch {}
      }
    }
  },
};

export {pluginManager, usePlugins, pluginMethod};
