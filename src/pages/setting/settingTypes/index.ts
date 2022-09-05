import BackupSetting from "./backupSetting";
import BasicSetting from "./basicSetting";
import PluginSetting from "./pluginSetting";
import ThemeSetting from "./themeSetting";

const settingTypes: Record<string, {
    title: string;
    component: (...args: any) => JSX.Element
}> = {
    basic: {
        title: '基本设置',
        component: BasicSetting
    },
    plugin: {
        title: '插件设置',
        component: PluginSetting
    },
    theme: {
        title: '主题设置',
        component: ThemeSetting
    },
    backup: {
        title: '备份与恢复',
        component: BackupSetting
    }
}

export default settingTypes;