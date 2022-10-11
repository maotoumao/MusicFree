import {NativeModules} from 'react-native';

interface INativeUtils {
    exitApp: () => void;
    // getRealPath: (filePath: string) => Promise<string>;
}

const NativeUtils = NativeModules.NativeUtils;

export default NativeUtils as INativeUtils;
