import {NativeModules} from 'react-native';

interface INativeUtils {
    exitApp: () => void;
}

const NativeUtils = NativeModules.NativeUtils;

export default NativeUtils as INativeUtils;
