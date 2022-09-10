import {Platform} from 'react-native';
import RNFS from 'react-native-fs';

export const basePath =
    Platform.OS === 'android'
        ? RNFS.ExternalDirectoryPath
        : RNFS.DocumentDirectoryPath;

const storagePath = RNFS.ExternalStorageDirectoryPath;

export default {
    pluginPath: `${basePath}/plugins/`,
    logPath: `${basePath}/log/`,
    dataPath: `${basePath}/data/`,
    cachePath: `${basePath}/cache/`,
    lrcCachePath: `${basePath}/cache/lrc/`,
    storagePath: `${storagePath}/musicfree/`,
    downloadPath: `${storagePath}/musicfree/download/`,
};
