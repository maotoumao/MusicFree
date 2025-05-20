import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

export function getAppUserAgent(): string {
    const appName = DeviceInfo.getApplicationName();
    const appVersion = DeviceInfo.getVersion();
    return `${appName}/${appVersion} (${Platform.OS} ${DeviceInfo.getSystemVersion()}; ${DeviceInfo.getModel()})`;
}