import RNFS from 'react-native-fs';
import CryptoJs from 'crypto-js';
import dayjs from 'dayjs';
import axios from 'axios';
import {useEffect, useState} from 'react';
import {ToastAndroid} from 'react-native';
import pathConst from '@/constants/pathConst';
import {satisfies} from 'compare-versions';
import DeviceInfo from 'react-native-device-info';
import StateMapper from '@/utils/stateMapper';

const sha256 = CryptoJs.SHA256;

enum PluginStateCode {
  /** 版本不匹配 */
  VersionNotMatch,
  /** 插件不完整 */
  NotComplete,
  /** 无法解析 */
  CannotParse,
}
class Plugin {
  /** 插件名 */
  public name: string;
  /** 插件的hash，作为唯一id */
  public hash: string;
  /** 插件状态：激活、关闭、错误 */
  public state: 'enabled' | 'disabled' | 'error';
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

export {pluginManager, usePlugins};
