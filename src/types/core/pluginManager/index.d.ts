type Plugin = any; // Placeholder for the actual Plugin type

/**
 * 插件安装配置接口
 */
export interface IInstallPluginConfig {
    notCheckVersion?: boolean;
}

/**
 * 插件安装结果接口
 */
export interface IInstallPluginResult {
    success: boolean;
    message?: string;
    pluginName?: string;
    pluginHash?: string;
    pluginUrl?: string;
}

/**
 * 插件管理器接口
 */
export interface IPluginManager {
    /**
     * 初始化插件管理器，从文件系统加载所有插件
     * 读取插件目录中的所有.js文件并创建插件实例
     * @throws 如果插件初始化失败则抛出异常
     */
    setup(): Promise<void>;

    /**
     * 从本地文件安装插件
     * @param pluginPath - 插件文件路径
     * @param config - 安装配置选项
     * @param config.notCheckVersion - 为true时跳过版本检查
     * @param config.useExpoFs - 为true时使用Expo文件系统代替React Native的文件系统
     * @returns 安装结果，包含成功状态和相关信息
     */
    installPluginFromLocalFile(
        pluginPath: string,
        config?: IInstallPluginConfig & {
            useExpoFs?: boolean
        },
    ): Promise<IInstallPluginResult>;

    /**
     * 从URL安装插件
     * @param url - 下载插件的URL
     * @param config - 安装配置选项
     * @param config.notCheckVersion - 为true时跳过版本检查
     * @returns 安装结果，包含成功状态和相关信息
     */
    installPluginFromUrl(
        url: string,
        config?: IInstallPluginConfig,
    ): Promise<IInstallPluginResult>;

    /**
     * 通过哈希值卸载插件
     * @param hash - 要卸载的插件哈希值
     */
    uninstallPlugin(hash: string): Promise<void>;

    /**
     * 卸载系统中的所有插件
     * 同时清理媒体额外数据并删除插件文件
     */
    uninstallAllPlugins(): Promise<void>;

    /**
     * 使用插件的源URL更新插件
     * @param plugin - 要更新的插件实例
     * @throws 如果插件没有源URL或更新失败时抛出错误
     */
    updatePlugin(plugin: Plugin): Promise<void>;

    /**
     * 通过媒体项的平台信息获取对应的插件
     * @param mediaItem - 包含平台信息的媒体项
     * @returns 与媒体平台匹配的插件实例或undefined
     */
    getByMedia(mediaItem: ICommon.IMediaBase): Plugin | undefined;

    /**
     * 通过名称获取插件
     * @param name - 要查找的插件名称
     * @returns 匹配名称的插件实例或本地文件插件
     */
    getByName(name: string): Plugin | undefined;

    /**
     * 通过哈希值获取插件
     * @param hash - 要查找的插件哈希值
     * @returns 匹配哈希的插件实例或本地文件插件
     */
    getByHash(hash: string): Plugin | undefined;

    /**
     * 获取所有已启用的插件
     * @returns 已启用的插件实例数组
     */
    getEnabledPlugins(): Plugin[];

    /**
     * 获取按顺序排序的所有插件
     * @returns 按定义顺序排序的插件实例数组
     */
    getSortedPlugins(): Plugin[];

    /**
     * 获取所有支持搜索功能的已启用插件
     * @param supportedSearchType - 可选的搜索媒体类型过滤器
     * @returns 可搜索的插件实例数组
     */
    getSearchablePlugins(supportedSearchType?: ICommon.SupportMediaType): Plugin[];

    /**
     * 获取所有支持搜索功能的已启用插件，并按顺序排序
     * @param supportedSearchType - 可选的搜索媒体类型过滤器
     * @returns 按顺序排序的可搜索插件实例数组
     */
    getSortedSearchablePlugins(
        supportedSearchType?: ICommon.SupportMediaType,
    ): Plugin[];

    /**
     * 获取所有实现特定功能的已启用插件
     * @param ability - 要检查的方法/功能名称
     * @returns 具有指定功能的插件实例数组
     */
    getPluginsWithAbility(ability: keyof IPlugin.IPluginInstanceMethods): Plugin[];

    /**
     * 获取所有实现特定功能的已启用插件，并按顺序排序
     * @param ability - 要检查的方法/功能名称
     * @returns 按顺序排序的具有指定功能的插件实例数组
     */
    getSortedPluginsWithAbility(ability: keyof IPlugin.IPluginInstanceMethods): Plugin[];

    /**
     * 设置插件的启用状态并发送事件通知
     * @param plugin - 要修改的插件实例
     * @param enabled - 是否启用插件
     */
    setPluginEnabled(plugin: Plugin, enabled: boolean): void;

    /**
     * 检查插件是否已启用
     * @param plugin - 要检查的插件实例
     * @returns 表示插件是否启用的布尔值
     */
    isPluginEnabled(plugin: Plugin): boolean;

    /**
     * 设置插件的排序顺序并发送顺序更新事件
     * @param sortedPlugins - 按期望顺序排列的插件实例数组
     */
    setPluginOrder(sortedPlugins: Plugin[]): void;

    /**
     * 设置插件的用户变量
     * @param plugin - 要设置用户变量的插件实例
     * @param userVariables - 用户变量键值对
     */
    setUserVariables(plugin: Plugin, userVariables: Record<string, string>): void;

    /**
     * 获取插件的用户变量
     * @param plugin - 要获取用户变量的插件实例
     * @returns 用户变量键值对
     */
    getUserVariables(plugin: Plugin): Record<string, string>;

    /**
     * 设置插件的替代插件名称
     * @param plugin - 要设置替代插件的插件实例
     * @param alternativePluginName - 替代插件的名称
     */
    setAlternativePluginName(plugin: Plugin, alternativePluginName: string): void;

    /**
     * 获取插件的替代插件名称
     * @param plugin - 要获取替代插件名称的插件实例
     * @returns 替代插件的名称
     */
    getAlternativePluginName(plugin: Plugin): string | null;

    /**
     * 获取插件的替代插件实例
     * @param plugin - 要获取替代插件的插件实例
     * @returns 替代插件实例或null
     */
    getAlternativePlugin(plugin: Plugin): Plugin | null;
}

