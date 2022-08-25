import RNFS from 'react-native-fs';
import CryptoJs from 'crypto-js';
import dayjs from 'dayjs';
import axios from 'axios';
import {useEffect, useState} from 'react';
import {Platform, ToastAndroid} from 'react-native';

const pluginPath =
  (Platform.OS === 'android'
    ? RNFS.ExternalDirectoryPath
    : RNFS.DocumentDirectoryPath) + '/plugins/';
const sha256 = CryptoJs.SHA256;

class Plugin {
  public hash: string;
  public state: 'enabled' | 'disabled' | 'error';
  public instance: IPlugin.IPluginInstance;

  constructor(funcCode: string) {
    this.state = 'enabled';
    let _instance: IPlugin.IPluginInstance;
    try {
      _instance = Function(`
      'use strict';
      try {
        return ${funcCode};
      } catch(e) {
        return {};
      }
    `)()({CryptoJs, axios, dayjs});
      if (!this.checkValid(_instance)) {
        this.state = 'error';
      }
    } catch (e: any) {
      this.state = 'error';
      _instance = {
        platform: '',
        async playMusic() {
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
      'playMusic',
    ];
    if (keys.every(k => !_instance[k])) {
      return false;
    }
    return true;
  }
}

class PluginManager {
  private plugins: Array<Plugin> = [];
  loading: boolean = true;
  /** 插件安装位置 */
  pluginPath: string = pluginPath;
  constructor() {}

  private loadPlugin(funcCode: string) {
    const plugin = new Plugin(funcCode);
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

  getPluginByHash(hash: string) {
    return this.plugins.find(
      _ => _.hash === hash,
    );
  }

  async setupPlugins() {
    this.loading = true;
    this.plugins = [];
    try {
      const pathExist = await RNFS.exists(pluginPath);
      if (!pathExist) {
        await RNFS.mkdir(pluginPath);
        // 插件为空
        this.loading = false;
        return;
      }
      // 加载插件
      const pluginsPaths = await RNFS.readDir(pluginPath);
      for (let i = 0; i < pluginsPaths.length; ++i) {
        const _plugin = pluginsPaths[i];

        if (_plugin.isFile() && _plugin.name.endsWith('.js')) {
          const funcCode = await RNFS.readFile(_plugin.path, 'utf8');
          this.loadPlugin(funcCode);
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
