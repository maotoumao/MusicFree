// 国际化语言数据接口定义
export interface ILanguageData {
    // 通用词汇
    "common.setting": string; // 设置
    "common.software": string; // 软件
    "common.language": string; // 语言
    "common.theme": string; // 主题
    "common.other": string; // 其他
    "common.cancel": string; // 取消
    "common.about": string; // 关于
    "common.batchEdit": string; // 批量编辑
    "common.selectAll": string; // 全选
    "common.unselectAll": string; // 全不选
    "common.save": string; // 保存
    "common.download": string; // 下载
    "common.play": string; // 播放
    "common.delete": string; // 删除
    "common.unknownName": string; // 未知名称
    "common.default": string; // 默认
    "common.search": string; // 搜索
    "common.clear": string; // 清除
    "common.singleMusic": string; // 单曲
    "common.album": string; // 专辑
    "common.artist": string; // 艺术家
    "common.sheet": string; // 歌单
    "common.done": string; // 完成
    "common.edit": string; // 编辑
    "common.local": string; // 本地
    "common.sure": string; // 确定
    "common.confirm": string; // 确认
    "common.view": string; // 查看
    "common.open": string; // 打开
    "common.username": string; // 用户名
    "common.password": string; // 密码
    "common.cover": string; // 封面
    "common.name": string; // 名称
    "common.comment": string; // 评论
    "common.emptyList": string; // 空列表
    "common.loading": string; // 加载中
    "common.error": string; // 出错
    "common.clickToRetry": string; // 点击重试
    "common.failToLoad": string; // 加载失败
    "common.listReachEnd": string; // 列表到底

    // 侧边栏相关
    "sidebar.basicSettings": string; // 基本设置
    "sidebar.pluginManagement": string; // 插件管理
    "sidebar.themeSettings": string; // 主题设置
    "sidebar.scheduleClose": string; // 定时关闭
    "sidebar.backupAndResume": string; // 备份与恢复
    "sidebar.permissionManagement": string; // 权限管理
    "sidebar.checkUpdate": string; // 检查更新
    "sidebar.currentVersion": string; // 当前版本
    "sidebar.backToDesktop": string; // 返回桌面
    "sidebar.exitApp": string; // 退出应用
    "sidebar.languageSettings": string; // 语言设置

    // 检查更新相关
    "checkUpdate.error.latestVersion": string; // 当前已是最新版本

    // 首页相关
    "home.recommendSheet": string; // 推荐歌单
    "home.topList": string; // 榜单
    "home.playHistory": string; // 播放历史
    "home.localMusic": string; // 本地音乐
    "home.openSidebar.a11y": string; // 打开侧边栏
    "home.myPlaylists": string; // 我的歌单
    "home.starredPlaylists": string; // 我喜欢的歌单
    "home.newPlaylist.a11y": string; // 新建歌单
    "home.importPlaylist.a11y": string; // 导入歌单
    "home.myPlaylistsCount.a11y": string; // 我的歌单数量
    "home.starredPlaylistsCount.a11y": string; // 我喜欢的歌单数量
    "home.songCount": string; // 歌曲数量
    "home.clickToSearch": string; // 点击搜索

    // 对话框相关
    "dialog.deleteSheetTitle": string; // 删除歌单
    "dialog.deleteSheetContent": string; // 确定删除该歌单吗？

    "dialog.loading.reinitializeTrackPlayer": string;

    // 提示消息相关
    "toast.deleteSuccess": string; // 删除成功
    "toast.hasStarred": string; // 已收藏歌单
    "toast.hasUnstarred": string; // 已取消收藏歌单
    "toast.importSuccess": string; // 导入成功
    "toast.saveSuccess": string; // 保存成功
    "toast.sortHasBeenUpdated": string; // 排序已更新
    "toast.currentQualityNotAvailableForCurrentMusic": string; // 当前音乐的质量在此设备上不可用
    "toast.commmentNotAvaliableForCurrentMusic": string; // 当前音乐无法进行评论
    "toast.addToNextPlay": string; // 添加到下一曲
    "toast.beginDownload": string; // 开始下载
    "toast.rememberToSave": string; // 请记得保存

    // 本地音乐相关
    "localMusic.scanLocalMusic": string; // 扫描本地音乐
    "localMusic.beginScan": string; // 开始扫描
    "localMusic.downloadList": string; // 下载列表

    // 歌词相关
    "lyric.lyricLinkedFrom": string; // 歌词来自
    "lyric.unlinkLyric": string; // 取消链接歌词
    "lyric.noLyric": string; // 暂无歌词
    "lyric.searchLyric": string; // 搜索歌词

    // 音乐列表编辑器相关
    "musicListEditor.selectMusicCount": string; // 选择的音乐数量
    "musicListEditor.addToNextPlay": string; // 添加到下一曲
    "musicListEditor.addToSheet": string; // 添加到歌单

    // 权限设置相关
    "permissionSetting.title": string; // 权限设置
    "permissionSetting.description": string; // 权限设置说明
    "permissionSetting.floatWindowPermission": string; // 悬浮窗权限
    "permissionSetting.floatWindowPermissionDescription": string; // 悬浮窗权限说明
    "permissionSetting.fileReadWritePermission": string; // 文件读写权限
    "permissionSetting.fileReadWritePermissionDescription": string; // 文件读写权限说明

    // 推荐歌单相关
    "recommendSheet.title": string; // 推荐歌单

    // 搜索音乐列表相关
    "searchMusicList.searchPlaceHolder": string; // 搜索音乐
    "searchMusicList.searchLabel.a11y": string; // 搜索音乐标签

    // 搜索页面相关
    "searchPage.searchPlaceHolder": string; // 搜索
    "searchPage.searchLabel.a11y": string; // 搜索标签
    "searchPage.history": string; // 历史记录
    "searchPage.artistResultWorksNum": string; // 艺术家作品数量
    "searchPage.comingSoon": string; // 敬请期待

    // 榜单相关
    "topList.title": string; // 榜单

    // 歌单详情相关
    "sheetDetail.totalMusicCount": string; // 歌曲总数
    "sheetDetail.editSheetInfo": string; // 编辑歌单信息
    "sheetDetail.batchEditMusic": string; // 批量编辑音乐
    "sheetDetail.sortMusic": string; // 排序音乐
    "sheetDetail.sortMusicOption.byTitle": string; // 按标题排序
    "sheetDetail.sortMusicOption.byArtist": string; // 按艺术家排序
    "sheetDetail.sortMusicOption.byAlbum": string; // 按专辑排序
    "sheetDetail.sortMusicOption.newest": string; // 最新
    "sheetDetail.sortMusicOption.oldest": string; // 最旧
    "sheetDetail.deleteSheet": string; // 删除歌单
    "sheetDetail.deleteSheetContent": string; // 确定删除该歌单吗？

    // 历史记录相关
    "history.title": string; // 历史记录
    "history.clearHistory": string; // 清除历史记录

    // 下载相关
    "downloading.title": string; // 下载
    "downloading.downloadFailReason.noWritePermission": string; // 下载失败：没有写入权限
    "downloading.downloadFailReason.failToFetchSource": string; // 下载失败：无法获取源
    "downloading.downloadFailReason.unknown": string; // 下载失败：未知原因
    "downloading.downloadStatus.completed": string; // 下载完成
    "downloading.downloadStatus.downloadProgress": string; // 下载进度
    "downloading.downloadStatus.pending": string; // 等待中
    "downloading.downloadStatus.preparing": string; // 准备中

    // 艺术家详情相关
    "artistDetail.fansCount": string; // 粉丝数量
    "artistDetail.menu.batchEditMusic": string; // 批量编辑音乐
    "artistDetail.musicSheet": string; // 音乐歌单

    // 插件设置相关
    "pluginSetting.pluginItem.options.updatePlugin": string; // 更新插件
    "pluginSetting.pluginItem.options.sharePlugin": string; // 分享插件
    "pluginSetting.pluginItem.options.uninstallPlugin": string; // 卸载插件
    "pluginSetting.pluginItem.options.uninstallPluginContent": string; // 确定卸载该插件吗？
    "pluginSetting.pluginItem.options.alternativePlugin": string; // 替代插件
    "pluginSetting.pluginItem.alternativePlugin": string; // 该插件实际使用的插件
    "pluginSetting.pluginItem.dialog.setAlternativePluginTitle": string; // 设置替代插件
    "pluginSetting.pluginItem.dialog.setAlternativePluginTip": string; // 将使用替代插件解析此插件的音乐源提示
    "pluginSetting.pluginItem.options.importMusic": string; // 导入音乐
    "pluginSetting.pluginItem.options.importMusicPlaceHolder": string; // 导入音乐链接
    "pluginSetting.pluginItem.options.importDialogTitle": string; // 导入音乐对话框标题
    "pluginSetting.pluginItem.options.importMusicDialogContent": string; // 导入音乐对话框内容
    "pluginSetting.pluginItem.options.importMusicToSheetName": string; // 导入音乐到歌单
    "pluginSetting.pluginItem.options.importSheet": string; // 导入歌单
    "pluginSetting.pluginItem.options.importSheetPlaceHolder": string; // 导入歌单链接
    "pluginSetting.pluginItem.options.importSheetDialogContent": string; // 导入歌单对话框内容
    "pluginSetting.pluginItem.options.userVariables": string; // 用户变量
    "pluginSetting.pluginItem.versionHint": string; // 版本提示
    "pluginSetting.pluginItem.author": string; // 作者
    "pluginSetting.menu.subscriptionSetting": string; // 订阅设置
    "pluginSetting.menu.sort": string; // 排序
    "pluginSetting.menu.uninstallAll": string; // 卸载所有
    "pluginSetting.menu.uninstallAllContent": string; // 确定卸载所有插件吗？
    "pluginSetting.menu.installPlugin": string; // 安装插件
    "pluginSetting.menu.installPluginDialogPlaceholder": string; // 插件安装对话框占位符
    "pluginSetting.menu.pluginInstallFailedDialogTitle": string; // 插件安装失败对话框标题
    "pluginSetting.menu.pluginUpdateFailedDialogTitle": string; // 插件更新失败对话框标题
    "pluginSetting.fabOptions.installFromLocal": string; // 从本地安装
    "pluginSetting.fabOptions.installFromNetwork": string; // 从网络安装
    "pluginSetting.fabOptions.updateAllPlugins": string; // 更新所有插件
    "pluginSetting.fabOptions.updateSubscription": string; // 更新订阅
    "pluginSetting.failReason": string; // 失败原因
    "pluginSetting.pluginInstallFailedDialogContent": string; // 插件安装失败对话框内容
    "pluginSetting.pluginUpdateFailedDialogContent": string; // 插件更新失败对话框内容

    // 提示消息相关 - 插件操作
    "toast.pluginUpdateSuccess": string; // 插件更新成功
    "toast.failToUpdatePlugin": string; // 插件更新失败
    "toast.copiedToClipboard": string; // 已复制到剪贴板
    "toast.copiedToClipboardFailed": string; // 复制失败
    "toast.failToSharePlugin": string; // 插件分享失败
    "toast.pluginUninstalled": string; // 插件已卸载
    "toast.toast.pluginUninstalled": string; // 插件已卸载
    "toast.failToImportMusic": string; // 音乐导入失败
    "toast.importing": string; // 正在导入
    "toast.failToImportSheet": string; // 歌单导入失败
    "toast.settingSuccess": string; // 设置成功
    "toast.installPluginSuccess": string; // 插件安装成功
    "toast.updatePluginSuccess": string; // 插件更新成功
    "toast.installPluginFail": string; // 插件安装失败
    "toast.allPluginInstallFailed": string; // 所有插件安装失败
    "toast.partialPluginInstallFailed": string; // 部分插件安装失败
    "toast.partialPluginInstallFailedWithReason": string; // 部分插件安装失败，原因：
    "toast.allPluginUpdateFailed": string; // 所有插件更新失败
    "toast.partialPluginUpdateFailed": string; // 部分插件更新失败
    "toast.noSubscription": string; // 没有订阅
    "toast.subscriptionInvalid": string; // 订阅无效
    "toast.subscriptionHaveToEndWithJs": string; // 订阅必须以.js结尾
    "toast.unknownError": string; // 未知错误

    // 主题设置相关
    "themeSettings.displayStyle": string; // 显示风格
    "themeSettings.followSystemTheme": string; // 跟随系统主题
    "themeSettings.setTheme": string; // 设置主题
    "themeSettings.lightMode": string; // 明亮模式
    "themeSettings.darkMode": string; // 黑暗模式
    "themeSettings.customMode": string; // 自定义模式


    // 自定义主题相关
    "setCustomTheme.customizeBackground": string; // 自定义背景
    "setCustomTheme.blur": string; // 模糊
    "setCustomTheme.opacity": string; // 不透明度
    "setCustomTheme.primaryColor": string; // 主题色
    "setCustomTheme.textColor": string; // 文字颜色
    "setCustomTheme.appBarColor": string; // 应用栏颜色
    "setCustomTheme.appBarTextColor": string; // 应用栏文字色
    "setCustomTheme.musicBarColor": string; // 音乐栏颜色
    "setCustomTheme.musicBarTextColor": string; // 音乐栏文字色
    "setCustomTheme.pageBackgroundColor": string; // 页面背景色
    "setCustomTheme.backdropColor": string; // 背景色
    "setCustomTheme.cardColor": string; // 卡片背景色
    "setCustomTheme.placeholderColor": string; // 输入框背景色
    "setCustomTheme.tabBarColor": string; // 导航栏背景色
    "setCustomTheme.notificationColor": string; // 提示、tips背景色

    // 备份与恢复相关
    "backupAndResume.beginBackup": string; // 开始备份
    "backupAndResume.backupDialogTitle": string; // 备份对话框标题
    "backupAndResume.backuping": string; // 正在备份
    "toast.backupSuccess": string; // 备份成功
    "toast.backupFail": string; // 备份失败
    "backupAndResume.resumeFromLocalFile": string; // 从本地文件恢复
    "backupAndResume.resuming": string; // 正在恢复
    "toast.resumeSuccess": string; // 恢复成功
    "toast.resumeFail": string; // 恢复失败
    "backupAndResume.resumeFromUrlDialogTitle": string; // 从URL恢复对话框标题
    "backupAndResume.resumeFromUrlDialogPlaceHolder": string; // 从URL恢复对话框占位符
    "toast.backupFileNotFound": string; // 备份文件未找到
    "toast.resumePreCheckFailed": string; // 恢复前检查失败
    "backupAndResume.setResumeMode": string; // 设置恢复模式
    "backupAndResume.resumeMode": string; // 恢复模式
    "backupAndResume.localBackup": string; // 本地备份
    "backupAndResume.backupToLocal": string; // 备份到本地
    "backupAndResume.webdavSettings": string; // WebDAV设置
    "backupAndResume.webdavUrl": string; // WebDAV URL
    "backupAndResume.backupToWebdav": string; // 备份到WebDAV
    "backupAndResume.resumeFromWebdav": string; // 从WebDAV恢复
    "backupAndResume.resumeMode.append": string; // 附加
    "backupAndResume.resumeMode.overwrite-default": string; // 覆盖（默认）
    "backupAndResume.resumeMode.overwrite": string; // 覆盖

    // 基本设置相关
    "basicSettings.common": string; // 通用
    "basicSettings.maxHistoryLength": string; // 最大历史记录长度
    "basicSettings.musicDetailDefault": string; // 音乐详情默认
    "basicSettings.musicDetailDefault.album": string; // 专辑
    "basicSettings.musicDetailDefault.lyric": string; // 歌词
    "basicSettings.musicDetailAwake": string; // 唤醒音乐详情
    "basicSettings.associateLyricType": string; // 关联歌词类型
    "basicSettings.associateLyricType.input": string; // 输入
    "basicSettings.associateLyricType.search": string; // 搜索
    "basicSettings.showExitOnNotification": string; // 通知中显示退出
    "basicSettings.sheetAndAlbum": string; // 歌单和专辑
    "basicSettings.clickMusicInSearch": string; // 点击搜索中的音乐
    "basicSettings.clickMusicInSearch.playMusic": string; // 播放歌曲
    "basicSettings.clickMusicInSearch.playMusicAndReplace": string; // 播放歌曲并替换播放列表
    "basicSettings.clickMusicInAlbum": string; // 点击专辑内单曲时
    "basicSettings.clickMusicInAlbum.playMusic": string; // 播放歌曲
    "basicSettings.clickMusicInAlbum.playAlbum": string; // 播放专辑
    
    "basicSettings.musicOrderInLocalSheet": string; // 新建歌单时默认歌曲排序
    "basicSettings.musicOrderInLocalSheet.title": string; // 按歌曲名排序
    "basicSettings.musicOrderInLocalSheet.artist": string; // 按作者名排序
    "basicSettings.musicOrderInLocalSheet.album": string; // 按专辑名排序
    "basicSettings.musicOrderInLocalSheet.newest": string; // 按收藏时间从新到旧排序
    "basicSettings.musicOrderInLocalSheet.oldest": string; // 按收藏时间从旧到新排序
    
    "basicSettings.plugin": string; // 插件
    "basicSettings.autoUpdatePlugin": string; // 软件启动时自动更新插件
    "basicSettings.notCheckPluginVersion": string; // 安装插件时不校验版本
    
    "basicSettings.playback": string; // 播放
    "basicSettings.notInterrupt": string; // 允许与其他应用同时播放
    "basicSettings.autoPlayWhenAppStart": string; // 软件启动时自动播放歌曲
    "basicSettings.tryChangeSourceWhenPlayFail": string; // 播放失败时尝试更换音源
    "basicSettings.autoStopWhenError": string; // 播放失败时自动暂停
    "basicSettings.tempRemoteDuck": string; // 播放被暂时打断时
    "basicSettings.tempRemoteDuck.pause": string; // 暂停播放
    "basicSettings.tempRemoteDuck.lowerVolume": string; // 降低音量
    "basicSettings.tempRemoteDuck.volumeDecreaseLevel": string; // 音量降低幅度
    "basicSettings.defaultPlayQuality": string; // 默认播放音质
    "basicSettings.playQualityOrder": string; // 默认播放音质缺失时
    "basicSettings.playQualityOrder.asc": string; // 播放更高音质
    "basicSettings.playQualityOrder.desc": string; // 播放更低音质
    
    "basicSettings.download": string; // 下载
    "basicSettings.downloadPath": string; // 下载路径
    "basicSettings.fileSelector.selectFolder": string; // 选择文件夹
    "basicSettings.maxDownload": string; // 最大同时下载数目
    "basicSettings.defaultDownloadQuality": string; // 默认下载音质
    "basicSettings.downloadQualityOrder": string; // 默认下载音质缺失时
    "basicSettings.downloadQualityOrder.asc": string; // 下载更高音质
    "basicSettings.downloadQualityOrder.desc": string; // 下载更低音质
    
    "basicSettings.network": string; // 网络
    "basicSettings.useCelluarNetworkPlay": string; // 使用移动网络播放
    "basicSettings.useCelluarNetworkDownload": string; // 使用移动网络下载
    
    "basicSettings.lyric": string; // 歌词
    "basicSettings.lyric.autoSearchLyric": string; // 歌词缺失时自动搜索歌词
    "basicSettings.lyric.showStatusBarLyric": string; // 开启桌面歌词
    "basicSettings.lyric.align": string; // 对齐方式
    "basicSettings.lyric.align.left": string; // 左对齐
    "basicSettings.lyric.align.center": string; // 居中对齐
    "basicSettings.lyric.align.right": string; // 右对齐
    "basicSettings.lyric.leftRightDistance": string; // 左右距离
    "basicSettings.lyric.topBottomDistance": string; // 上下距离
    "basicSettings.lyric.width": string; // 歌词宽度
    "basicSettings.lyric.fontSize": string; // 字体大小
    "basicSettings.lyric.textColor": string; // 文本颜色
    "basicSettings.lyric.backgroundColor": string; // 文本背景色
    
    "basicSettings.cache": string; // 缓存
    "basicSettings.cache.musicCacheLimit": string; // 音乐缓存上限
    "basicSettings.cache.clearMusicCache": string; // 清除音乐缓存
    "basicSettings.cache.clearLyricCache": string; // 清除歌词缓存
    "basicSettings.cache.clearImageCache": string; // 清除图片缓存
    
    "basicSettings.developer": string; // 开发选项
    "basicSettings.developer.errorLog": string; // 记录错误日志
    "basicSettings.developer.traceLog": string; // 记录详细日志
    "basicSettings.developer.devLog": string; // 调试面板
    "basicSettings.developer.viewErrorLog": string; // 查看错误日志
    "basicSettings.developer.clearLog": string; // 清空日志
    
    // 对话框相关 - 缓存设置
    "dialog.setCacheTitle": string; // 设置缓存
    "dialog.setCachePlaceholder": string; // 输入缓存占用上限提示
    "dialog.clearMusicCacheTitle": string; // 清除音乐缓存
    "dialog.clearMusicCacheContent": string; // 清除音乐缓存确认内容
    "dialog.clearLyricCacheTitle": string; // 清除歌词缓存
    "dialog.clearLyricCacheContent": string; // 清除歌词缓存确认内容
    "dialog.clearImageCacheTitle": string; // 清除图片缓存
    "dialog.clearImageCacheContent": string; // 清除图片缓存确认内容
    "dialog.errorLogTitle": string; // 错误日志
    "dialog.errorLogNoRecord": string; // 暂无记录
    "dialog.errorLogKnow": string; // 我知道了
    "dialog.errorLogCopy": string; // 复制日志
    "dialog.setScheduleCloseTime.title": string; // 设置定时关闭时间
    "dialog.setScheduleCloseTime.placeholder": string; // 请输入时间
    "dialog.setScheduleCloseTime.unit": string; // 分钟
    "dialog.setScheduleCloseTime.hint": string; // 最长支持设置24小时（1440分钟）
    
    // 提示消息相关 - 缓存和日志
    "toast.cacheSetSuccess": string; // 设置成功
    "toast.musicCacheCleared": string; // 已清除音乐缓存
    "toast.lyricCacheCleared": string; // 已清除歌词缓存
    "toast.imageCacheCleared": string; // 已清除图片缓存
    "toast.logCleared": string; // 日志已清空
    "toast.noFloatWindowPermission": string; // 无悬浮窗权限
    "toast.folderNotExistOrNoPermission": string; // 文件夹不存在或无权限
    
    // 音质相关
    "musicQuality.low": string; // 低音质
    "musicQuality.standard": string; // 标准音质
    "musicQuality.high": string; // 高音质
    "musicQuality.super": string; // 超高音质

    // 播放全部栏相关
    "playAllBar.title": string; // 播放全部

    // 无插件相关
    "noPlugin.title": string; // 还没有安装插件
    "noPlugin.titleWithType": string; // 还没有安装支持类型的插件
    "noPlugin.description": string; // 无插件描述

    // 对话框相关 - 存储权限
    "dialog.checkStorage.title": string; // 存储权限
    "dialog.checkStorage.content.0": string; // 存储权限内容0
    "dialog.checkStorage.content.1": string; // 存储权限内容1
    "dialog.checkStorage.content.2": string; // 存储权限内容2
    "dialog.checkStorage.content.3": string; // 存储权限内容3
    "dialog.checkStorage.button.grantPermission": string; // 去授予权限
    "dialog.checkStorage.button.doNotShowAgain": string; // 不再提示

    // 对话框相关 - 下载
    "dialog.downloadDialog.title": string; // 发现新版本
    "dialog.downloadDialog.skipThisVersion": string; // 跳过此版本
    "dialog.downloadDialog.downloadUsingBrowser": string; // 从浏览器下载
    "dialog.downloadDialog.backupUrl": string; // 备用链接
    "dialog.editSheetDetail.sheetName": string; // 歌单名
    "dialog.subscriptionPluginDialog.title": string; // 订阅
    "dialog.markdownDialog.openExternalLink": string; // Markdown对话框打开外部链接
    "dialog.markdownDialog.clickToShowImage": string; // 点击展示图片
    "dialog.markdownDialog.loadFailed": string; // 图片加载失败

    // 面板相关 - 播放列表
    "panel.playList.title": string; // 播放列表
    "panel.playList.count": string; // 歌曲数量
    "panel.searchLrc.inputPlaceholder": string; // 搜索歌词输入占位符
    "panel.searchLrc.toast.settingSuccess": string; // 设置成功
    "panel.searchLrc.toast.failToSearch": string; // 设置失败

    // 面板相关 - 添加到歌单
    "panel.addToMusicSheet.title": string; // 添加到歌单
    "panel.addToMusicSheet.newMusicSheet": string; // 新建歌单
    "panel.addToMusicSheet.count": string; // 歌曲数量
    "panel.addToMusicSheet.toast.success": string; // 已添加到歌单
    "panel.addToMusicSheet.toast.fail": string; // 添加到歌单失败
    "panel.associateLrc.title": string; // 关联歌词
    "panel.associateLrc.inputPlaceholder": string; // 输入要关联歌词的歌曲ID
    "panel.associateLrc.targetExpired": string; // 地址失效
    "panel.associateLrc.toast.success": string; // 关联歌词成功
    "panel.associateLrc.toast.fail": string; // 关联歌词失败
    "panel.associateLrc.toast.unlinkSuccess": string; // 取消关联歌词成功
    "panel.createMusicSheet.title": string; // 新建歌单
    "panel.editMusicSheetInfo.title": string; // 编辑歌单信息
    "panel.editMusicSheetInfo.sheetName": string; // 歌单名
    "panel.editMusicSheetInfo.toast.updateSuccess": string; // 更新歌单信息成功    // 面板相关 - 图片查看器
    "panel.imageViewer.saveImage": string; // 保存图片
    "panel.imageViewer.saveImageSuccess": string; // 图片已保存
    "panel.imageViewer.saveImageFail": string; // 保存图片失败

    // 面板相关 - 颜色选择器
    "panel.colorPicker.title": string; // 选择颜色
    "panel.createMusicSheet.inputLabel": string; // 输入框
    "panel.importMusicSheet.title": string; // 导入歌单
    "panel.importMusicSheet.placeholder": string; // 输入目标歌单
    "panel.importMusicSheet.importing": string; // 正在导入中
    "panel.importMusicSheet.prepareImport": string; // 准备导入
    "panel.importMusicSheet.foundSongs": string; // 发现歌曲
    "panel.importMusicSheet.invalidLink": string; // 链接有误或目标歌单为空

    // 面板相关 - 音乐项歌词选项
    "panel.musicItemLyricOptions.author": string; // 作者
    "panel.musicItemLyricOptions.album": string; // 专辑
    "panel.musicItemLyricOptions.toggleDesktopLyric": string; // 桌面歌词开关
    "panel.musicItemLyricOptions.enableDesktopLyric": string; // 开启
    "panel.musicItemLyricOptions.disableDesktopLyric": string; // 关闭
    "panel.musicItemLyricOptions.desktopLyricPermissionError": string; // 桌面歌词权限错误
    "panel.musicItemLyricOptions.uploadLocalLyric": string; // 上传本地歌词
    "panel.musicItemLyricOptions.uploadLocalLyricTranslation": string; // 上传本地歌词翻译
    "panel.musicItemLyricOptions.deleteLocalLyric": string; // 删除本地歌词
    "panel.musicItemLyricOptions.settingFail": string; // 设置失败
    "panel.musicItemLyricOptions.deleteFail": string; // 删除失败

    // 面板相关 - 音乐项选项    
    "panel.musicItemOptions.author": string; // 作者
    "panel.musicItemOptions.album": string; // 专辑
    "panel.musicItemOptions.downloaded": string; // 已下载
    "panel.musicItemOptions.readComment": string; // 查看评论
    "panel.musicItemOptions.deleteLocalDownload": string; // 删除本地下载
    "panel.musicItemOptions.deleteLocalDownloadConfirm": string; // 删除本地下载确认
    "panel.musicItemOptions.associatedLyric": string; // 已关联歌词
    "panel.musicItemOptions.associateLyric": string; // 关联歌词
    "panel.musicItemOptions.unassociateLyric": string; // 解除关联歌词    
    "panel.musicItemOptions.unassociateLyricSuccess": string; // 已解除关联歌词
    "panel.musicItemOptions.timingClose": string; // 定时关闭
    "panel.musicItemOptions.clearPluginCache": string; // 清除插件缓存
    "panel.musicItemOptions.cacheCleared": string; // 缓存已清除
    "panel.musicItemOptions.deleteFailed": string; // 删除失败

    // 面板相关 - 音质设置
    "panel.musicQuality.title": string; // 设置音质

    // 面板相关 - 搜索歌词
    "panel.searchLrc.unnamed": string; // 未命名
    "panel.searchLrc.notSupported": string; // 搜索歌词

    // 面板相关 - 字体大小设置
    "panel.setFontSize.title": string; // 设置字体大小
    "panel.setFontSize.small": string; // 小
    "panel.setFontSize.standard": string; // 标准
    "panel.setFontSize.large": string; // 大
    "panel.setFontSize.extraLarge": string; // 超大

    // 面板相关 - 歌词偏移设置
    "panel.setLyricOffset.title": string; // 设置歌词进度
    "panel.setLyricOffset.normal": string; // 正常
    "panel.setLyricOffset.delay": string; // 延后
    "panel.setLyricOffset.advance": string; // 提前
    "panel.setLyricOffset.reset": string; // 重置

    // 面板相关 - 简单输入
    "panel.simpleInput.inputLabel": string; // 输入框

    // 面板相关 - 定时关闭
    "panel.timingClose.countdown": string; // 关闭倒计时
    "panel.timingClose.customize": string; // 自定义
    "panel.timingClose.cancelScheduleClose": string; // 取消定时关闭
    "panel.timingClose.closeAfterPlay": string; // 播放完歌曲再关闭

    // 面板相关 - 播放速度
    "panel.playRate.title": string; // 播放速度

    // 面板相关 - 歌单标签
    "panel.sheetTags.title": string; // 歌单类别

    // 播放模式相关
    "repeatMode.SHUFFLE": string; // 随机播放
    "repeatMode.QUEUE": string; // 列表循环
    "repeatMode.SINGLE": string; // 单曲循环
}

// 语言接口定义
export interface ILanguage {
    locale: string; // 语言代码
    name: string; // 语言名称
    languageData: ILanguageData; // 语言数据
}