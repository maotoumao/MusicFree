import {NativeModules} from 'react-native';

export interface IBasicMeta {
    album?: string;
    artist?: string;
    author?: string;
    duration?: string;
    title?: string;
}

interface IMp3Util {
    getBasicMeta: (fileName: string) => Promise<IBasicMeta>;
    getMediaMeta: (fileNames: string[]) => Promise<IBasicMeta[]>;
}

const Mp3Util = NativeModules.Mp3Util;

export default Mp3Util as IMp3Util;
