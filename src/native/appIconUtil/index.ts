import {NativeModule, NativeModules} from 'react-native';

interface IAppIconUtil extends NativeModule {
    /** 修改图标 */
    changeIcon: (icon: 'Default' | 'Logo1') => Promise<void>;
    /** 获取当前图标 */
    getIcon: () => Promise<string>;
}

const AppIconUtil: IAppIconUtil = NativeModules.AppIconUtil;

export default AppIconUtil;
