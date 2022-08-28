import { Platform } from "react-native";
import RNFS from 'react-native-fs';

export const basePath = Platform.OS === 'android'
  ? RNFS.ExternalDirectoryPath
  : RNFS.DocumentDirectoryPath

const rootPath = RNFS.ExternalStorageDirectoryPath;


export default {
    pluginPath: `${basePath}/plugins/`,
    dataPath: `${basePath}/data/`,
    downloadPath: `${rootPath}/musicfree/`
}