import {StorageKeys} from '@/constants/commonConst';
import StateMapper from '@/utils/stateMapper';
import {getStorage, setStorage} from '@/utils/storage';
import {produce} from 'immer';
import objectPath from 'object-path';
import {Plugin} from './pluginManager';

/**
 * key: platform
 * value: Record<string, any>
 */
let pluginMetaAll: Record<string, IPlugin.IPluginMeta> = {};
let getPluginMetaAll = () => pluginMetaAll;
let pluginMetaAllStateMapper = new StateMapper(getPluginMetaAll);

/** 先初始化meta，再初始化plugins */
async function setupMeta(validKeys?: string[]) {
    const meta = await getStorage(StorageKeys.PluginMetaKey);
    if (meta !== null) {
        if (!validKeys) {
            pluginMetaAll = meta;
        } else {
            const newMeta: Record<string, IPlugin.IPluginMeta> = {};
            validKeys.forEach(k => {
                if (meta[k]) {
                    newMeta[k] = meta[k];
                }
            });
            await setStorage(StorageKeys.PluginMetaKey, newMeta);
            pluginMetaAll = newMeta;
        }
        pluginMetaAllStateMapper.notify();
    }
}

async function setPluginMetaAll(newMeta: Record<string, IPlugin.IPluginMeta>) {
    await setStorage(StorageKeys.PluginMetaKey, newMeta);
    pluginMetaAll = newMeta;
    pluginMetaAllStateMapper.notify();
}

async function setPluginMeta(plugin: Plugin, meta: IPlugin.IPluginMeta) {
    const newMeta = produce(pluginMetaAll, draft => {
        draft[plugin.name] = meta;
    });
    await setStorage(StorageKeys.PluginMetaKey, newMeta);
    pluginMetaAll = newMeta;
    pluginMetaAllStateMapper.notify();
}

async function setPluginMetaProp<K extends keyof IPlugin.IPluginMeta>(
    plugin: Plugin,
    prop: K,
    value: IPlugin.IPluginMeta[K],
) {
    const newMeta = produce(pluginMetaAll, draft => {
        objectPath.set(draft, `${plugin.name}.${prop}`, value);
    });
    await setStorage(StorageKeys.PluginMetaKey, newMeta);
    pluginMetaAll = newMeta;
    pluginMetaAllStateMapper.notify();
}

function getPluginMeta(plugin: Plugin) {
    return pluginMetaAll[plugin.name] ?? {};
}

export const PluginMeta = {
    setupMeta,
    setPluginMeta,
    setPluginMetaAll,
    getPluginMetaAll,
    setPluginMetaProp,
    getPluginMeta,
    usePluginMetaAll: pluginMetaAllStateMapper.useMappedState,
};
