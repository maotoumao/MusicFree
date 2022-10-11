import {NativeModules} from 'react-native';

interface IBasicMeta {
    album?: string;
    artist?: string;
    author?: string;
    duration?: string;
    title?: string;
}

interface IMp3Util {
    getBasicMeta: (fileName: string) => Promise<IBasicMeta>;
}

const NativeUtils = NativeModules.Mp3Util;

export default NativeUtils as IMp3Util;
