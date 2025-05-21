import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

export function getAppUserAgent(): string {
    const appName = DeviceInfo.getApplicationName();
    const appVersion = DeviceInfo.getVersion();
    
    if (Platform.OS === 'android') {
        return `${appName}/${appVersion} (Android ${DeviceInfo.getSystemVersion()}; ${DeviceInfo.getModel()})`;
    } else if (Platform.OS === 'ios') {
        return `${appName}/${appVersion} (iPhone; iOS ${DeviceInfo.getSystemVersion()}; ${DeviceInfo.getModel()})`;
    }

    return `${appName}/${appVersion}`;
}
