export interface ILanguageData {
    /** Settings */
    "common.setting": string;
    /** Software */
    "common.software": string;
    /** Language */
    "common.language": string;
    /** Theme */
    "common.theme": string;
    /** Other */
    "common.other": string;
    /** About */
    "common.about": string;
    /** Basic Settings */
    "sidebar.basicSettings": string;
    /** Plugin Management */
    "sidebar.pluginManagement": string;
    /** Theme Settings */
    "sidebar.themeSettings": string;
    /** Scheduled Close */
    "sidebar.scheduleClose": string;
    /** Backup & Restore */
    "sidebar.backupAndResume": string;
    /** Permission Management */
    "sidebar.permissionManagement": string;
    /** Check for Updates */
    "sidebar.checkUpdate": string;
    /** Current Version prefix */
    "sidebar.currentVersion": string;
    /** Back to Desktop */
    "sidebar.backToDesktop": string;
    /** Exit App */
    "sidebar.exitApp": string;
    /** Language Settings */
    "sidebar.languageSettings": string;
}

export interface ILanguage {
    locale: string;
    name: string;
    languageData: ILanguageData;
}

export interface II18n {
    
}