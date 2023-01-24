import deviceInfoModule from 'react-native-device-info';
import AboutSetting from './aboutSetting';
import BackupSetting from './backupSetting';
import BasicSetting from './basicSetting';
import PluginSetting from './pluginSetting';
import ThemeSetting from './themeSetting';

const settingTypes: Record<
    string,
    {
        title: string;
        component: (...args: any) => JSX.Element;
        showNav?: boolean;
    }
> = {
    basic: {
        title: '基本设置',
        component: BasicSetting,
    },
    plugin: {
        title: '插件设置',
        component: PluginSetting,
        showNav: false,
    },
    theme: {
        title: '主题设置',
        component: ThemeSetting,
    },
    backup: {
        title: '备份与恢复',
        component: BackupSetting,
    },
    about: {
        title: `关于${deviceInfoModule.getApplicationName()}`,
        component: AboutSetting,
    },
};

export default settingTypes;
