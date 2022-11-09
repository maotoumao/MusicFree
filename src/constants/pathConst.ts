import {Platform} from 'react-native';
import RNFS, {CachesDirectoryPath} from 'react-native-fs';

export const basePath =
    Platform.OS === 'android'
        ? RNFS.ExternalDirectoryPath
        : RNFS.DocumentDirectoryPath;

export default {
    basePath,
    pluginPath: `${basePath}/plugins/`,
    logPath: `${basePath}/log/`,
    dataPath: `${basePath}/data/`,
    cachePath: `${basePath}/cache/`,
    musicCachePath: CachesDirectoryPath + '/TrackPlayer',
    imageCachePath: CachesDirectoryPath + '/image_manager_disk_cache',
    lrcCachePath: `${basePath}/cache/lrc/`,
    downloadPath: `${basePath}/download/`,
    downloadMusicPath: `${basePath}/download/music/`,
};
