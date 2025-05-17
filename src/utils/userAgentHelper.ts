import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

export function getAppUserAgent(): string {
    const appName = DeviceInfo.getApplicationName();
    const appVersion = DeviceInfo.getVersion();

    if (Platform.OS === 'android') {
        const osVersion = DeviceInfo.getSystemVersion();
        const deviceModel = DeviceInfo.getModel();
        return `Mozilla/5.0 (Linux; Android ${osVersion}; ${deviceModel}; rv:112.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 ${appName}/${appVersion}`;
    } else if (Platform.OS === 'ios') {
        const osVersion = DeviceInfo.getSystemVersion().replace(/\./g, '_');
        const deviceModel = DeviceInfo.getModel();
        return `Mozilla/5.0 (${deviceModel}; CPU iPhone OS ${osVersion} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ${appName}/${appVersion}`;
    }
    return `${appName}/${appVersion} (${Platform.OS})`;
}