import { NativeModule, NativeModules } from "react-native";

interface INativeUtils extends NativeModule {
    exitApp: () => void;
    checkStoragePermission: () => Promise<boolean>;
    requestStoragePermission: () => void;
    getWindowDimensions: () => { width: number, height: number }; // Fix bug: https://github.com/facebook/react-native/issues/47080
}

const NativeUtils = NativeModules.NativeUtils;

export default NativeUtils as INativeUtils;
