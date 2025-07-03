import deviceInfoModule from "react-native-device-info";
import AboutSetting from "./aboutSetting";
import BackupSetting from "./backupSetting";
import BasicSetting from "./basicSetting";
import PluginSetting from "./pluginSetting";
import ThemeSetting from "./themeSetting";

const settingTypes: Record<
    string,
    {
        title: string;
        component: (...args: any) => JSX.Element;
        showNav?: boolean;
        i18nKey: string;
    }
> = {
    basic: {
        title: "基本设置",
        i18nKey: "sidebar.basicSettings",
        component: BasicSetting,
    },
    plugin: {
        title: "插件管理",
        i18nKey: "sidebar.pluginManagement",
        component: PluginSetting,
        showNav: false,
    },
    theme: {
        title: "主题设置",
        i18nKey: "sidebar.themeSettings",
        component: ThemeSetting,
    },
    backup: {
        title: "备份与恢复",
        i18nKey: "sidebar.backupAndResume",
        component: BackupSetting,
    },
    about: {
        title: `关于${deviceInfoModule.getApplicationName()}`,
        i18nKey: "common.about",
        component: AboutSetting,
    },
};

export default settingTypes;
