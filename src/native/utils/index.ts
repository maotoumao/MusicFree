import {NativeModule, NativeModules} from 'react-native';

interface INativeUtils extends NativeModule {
    exitApp: () => void;
    checkStoragePermission: () => Promise<boolean>;
    requestStoragePermission: () => void;
}

const NativeUtils = NativeModules.NativeUtils;

export default NativeUtils as INativeUtils;
