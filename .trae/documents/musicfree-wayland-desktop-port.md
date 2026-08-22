# MusicFree Wayland 桌面端改造计划

> 目标:在**不影响 Android/iOS 原有功能与构建**的前提下,为项目新增 Linux 桌面端支持(Wayland 优先、兼容 X11),复用全部现有业务代码与插件生态,并提供完整桌面体验(托盘、MPRIS 媒体键、桌面歌词悬浮窗、系统通知)。

## 1. 概述

* **技术路线**(用户已确认):Electron + react-native-web

* **核心策略**:

  1. `src/` 共享业务代码**零修改**(所有平台差异通过 desktop 端 webpack `resolve.alias` 将原生模块指向 shim 吸收)
  2. 插件沙盒(`src/core/pluginManager/plugin.ts` 的 `Function()` + `_require` 白名单机制)**原样复用**,`env.os`/`process.platform` 保持硬编码 `"android"`(现状即如此,iOS 上也是),保证原插件行为完全一致
  3. 移动端 Metro/Gradle/Xcode 构建不感知 `desktop/` 目录,依赖树不变

* **Wayland 支持**:Chromium Ozone(`--ozone-platform-hint=auto`,有 `WAYLAND_DISPLAY` 用 wayland,否则回退 x11),AppImage/deb 双协议兼容

## 2. 现状分析(探索结论)

### 2.1 有利条件

* 插件是运行时加载的纯 JS 文件,沙盒内只暴露白名单 npm 包(cheerio/crypto-js/axios/dayjs/big-integer/qs/he/webdav),**不直接触碰原生 API** → 桌面端可原样运行

* UI 栈大部分有官方 web 支持:@react-navigation(native-stack/drawer)、react-native-reanimated v3、react-native-gesture-handler v2、react-native-screens(web 自动回退)、react-native-safe-area-context、react-native-tab-view、react-native-svg(v15 自带 web 构建)

* 业务层已抽象:`src/core/trackPlayer/index.ts` 封装了 react-native-track-player 的全部调用(共约 20 个 API),shim 只需实现这一子集

### 2.2 原生依赖清单与桌面替代方案(shim 对照表)

| 原生模块                                             | 使用位置(代表)                                                            | 桌面 shim 方案                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| react-native-track-player                        | core/trackPlayer、service/index.ts、lyricManager                      | **自研完整 shim**:HTMLAudioElement + hls.js(Chromium 不原生支持 m3u8)+ MediaSession API,详见 4.4 |
| react-native-fs                                  | 30+ 文件(pluginManager、downloader、localMusicSheet、log、fileSelector 等) | IPC → 主进程 Node fs,同名 API 全量实现(含 downloadFile 进度事件)                                    |
| react-native-mmkv                                | getOrCreateMMKV、appConfig、persistStatus                             | MMKV 类:内存 Map + preload 同步 IPC 落盘(JSON 文件/userData/mmkv/),API 签名一致                    |
| @react-native-async-storage/async-storage        | utils/storage、musicSheet/migrate                                    | localStorage 封装的同签名异步 API                                                             |
| 自定义 NativeUtils                                  | bootstrap、native/utils                                              | exitApp→win.close;checkStoragePermission→true;getWindowDimensions→window 尺寸           |
| 自定义 Mp3Util                                      | plugin.ts 本地插件、下载写标签                                                | IPC → 主进程:music-metadata 读元数据/封面(base64)/内嵌歌词;node-id3 写标签                            |
| 自定义 LyricUtil(状态栏歌词)                             | lyricManager、basicSetting                                           | IPC → 独立桌面歌词悬浮窗(透明/无边框/置顶/跳过任务栏),见 4.3                                                |
| @shopify/flash-list(1.7)                         | 12 处列表                                                              | **无 web 支持** → shim 为 react-native-web FlatList 透传包装                                  |
| react-native-fast-image                          | fileUtils、fastImage 组件                                              | react-native-web Image(忽略 priority 等原生属性)                                             |
| @react-native-community/slider                   | seekBar、setFontSize、basicSetting                                    | 样式化 `input[type=range]` React 组件,props 兼容                                             |
| @react-native-community/netinfo                  | utils/network                                                       | navigator.onLine + online/offline 事件;isCellular 恒 false                               |
| @react-native-clipboard/clipboard                | 6 处                                                                 | navigator.clipboard                                                                   |
| react-native-device-info                         | plugin.ts、drawer、errorBoundary、checkUpdate                          | 静态值:getVersion 读 desktop package.json,其余合理默认                                          |
| react-native-permissions                         | bootstrap                                                           | check/request 恒返回 "granted"                                                           |
| react-native-share                               | musicDetail/navBar                                                  | IPC:复制链接/保存文件/shell.openExternal 降级                                                   |
| react-native-image-picker / expo-document-picker | setCustomTheme、pluginList、backupSetting、musicItemLyricOptions       | IPC → dialog.showOpenDialog,返回同结构结果                                                   |
| expo-file-system                                 | pluginManager、backupSetting 等                                       | 基于桌面 fs 的 readAsStringAsync/writeAsStringAsync                                        |
| expo-keep-awake                                  | musicDetail                                                         | IPC → 主进程 powerSaveBlocker("audio-playback")                                          |
| expo-splash-screen                               | bootstrap                                                           | no-op                                                                                 |
| react-native-webview                             | 仅 markdownDialog                                                    | dangerouslySetInnerHTML + marked(项目已依赖,渲染前 sanitize)                                  |
| react-native-image-colors                        | setCustomTheme/body                                                 | IPC → 主进程 node-vibrant                                                                |
| react-native-linear-gradient                     | colorPicker                                                         | CSS linear-gradient 组件                                                                |
| @react-native-masked-view/masked-view            | 全局搜索确认使用点                                                           | 透传 View(蒙版降级为不裁剪)                                                                     |
| react-native-background-timer                    | scheduleClose、delay                                                 | setTimeout/setInterval                                                                |
| react-native-get-random-values                   | bootstrap 第一行                                                       | crypto.getRandomValues polyfill                                                       |
| react-native-url-polyfill                        | plugin.ts                                                           | re-export 全局 URL(Chromium 原生完整)                                                       |
| react-native-logs                                | utils/log                                                           | 纯 JS,直接可用;fileAsyncTransport 走 fs shim                                                |
| webdav                                           | backup                                                              | babel alias 定向到 `webdav/dist/react-native`;desktop webpack 直接用默认浏览器构建                 |

### 2.3 移动端专属逻辑在桌面的自然降级

* `bootstrap.ts` 权限检查:`Platform.OS === "android"` 为 false(rnw 下为 "web"),走 else 分支 → permissions shim 恒 granted,不弹窗

* `StatusBar.setBackgroundColor` / `expo-splash-screen`:rnw 为 no-op

* 蜂窝网络限制(`Network.isCellular` 恒 false):桌面恒为 WiFi 语义,不弹流量提醒

## 3. 目标目录结构

```
/workspace
├── src/                        # 共享业务代码(零修改)
├── android/  ios/              # 移动端(不动)
└── desktop/                    # ★ 新增:Electron 桌面端(独立 package.json)
    ├── package.json            # electron、react-native-web、webpack、hls.js、dbus-next、music-metadata、node-id3、node-vibrant
    ├── webpack.config.js       # 渲染进程打包,resolve.alias 指向 shims(见 4.1)
    ├── tsconfig.json
    ├── electron-builder.yml    # AppImage + deb
    └── src/
        ├── main/               # Electron 主进程
        │   ├── main.ts         # 窗口/Ozone 开关/单实例/musicfree:// 深链/自定义协议
        │   ├── ipc.ts          # IPC 注册与分发
        │   ├── fs-service.ts   # react-native-fs 等价文件服务(downloadFile 用 net)
        │   ├── media-proxy.ts  # musicfree-http:// 协议:注入 Referer/UA/headers 流式代理音源
        │   ├── local-media.ts  # musicfree-local:// 协议:本地音频流式读取
        │   ├── tag-service.ts  # Mp3Util:music-metadata 读 + node-id3 写
        │   ├── tray.ts         # 托盘(播放/暂停/上一首/下一首/显示窗口/桌面歌词/退出)
        │   ├── mpris.ts        # MPRIS D-Bus(dbus-next):playerctl/桌面环境媒体控制
        │   ├── lyric-window.ts # 桌面歌词悬浮窗
        │   └── notify.ts       # 系统通知
        ├── preload/index.ts    # contextBridge:desktopFs 同步/异步 API、desktopDialog 等
        ├── renderer/
        │   ├── index.tsx       # 入口:AppRegistry.runApplication(rnw)→ 复用 src/entry
        │   ├── index.html
        │   ├── polyfills.ts    # ErrorUtils.setGlobalHandler、global polyfill
        │   ├── service.ts      # 复刻 index.js:TrackPlayer.registerPlaybackService(require src/service)
        │   ├── lyric/          # 歌词窗口独立渲染入口(轻量 React 页面,读 MMKV 状态)
        │   └── shims/          # ★ 2.2 表中全部 shim(含 @/native/* 三个模块的桌面实现)
        └── assets/             # 托盘/应用图标(复用 generator 产物)
```

## 4. 具体设计

### 4.1 webpack resolve.alias 全表(核心机制)

```
react-native$                    → react-native-web
@shopify/flash-list              → desktop/src/renderer/shims/flash-list.ts
react-native-track-player        → shims/track-player.ts
react-native-fs                  → shims/fs.ts
react-native-mmkv                → shims/mmkv.ts
@react-native-async-storage/async-storage → shims/async-storage.ts
@react-native-community/(netinfo|slider)  → shims/*
@react-native-clipboard/clipboard         → shims/clipboard.ts
react-native-device-info          → shims/device-info.ts
react-native-permissions          → shims/permissions.ts
react-native-share                → shims/share.ts
react-native-image-picker         → shims/image-picker.ts
react-native-fast-image           → shims/fast-image.ts
react-native-webview              → shims/webview.tsx
react-native-image-colors         → shims/image-colors.ts
react-native-linear-gradient      → shims/linear-gradient.tsx
@react-native-masked-view/masked-view → shims/masked-view.tsx
react-native-background-timer     → shims/background-timer.ts
react-native-get-random-values    → shims/get-random-values.ts
react-native-url-polyfill         → shims/url-polyfill.ts
expo-document-picker / expo-file-system / expo-keep-awake / expo-splash-screen → shims/*
@/native/utils | @/native/mp3Util | @/native/lyricUtil → shims/native-*.ts(桌面实现)
```

* babel 配置:@babel/preset-typescript + @babel/preset-react + module-resolver(沿用 `^@/(.+)` 别名)+ reanimated/plugin

* svg:`src/assets/icons/*.svg` 经 @svgr/webpack 转组件(等价移动端 react-native-svg-transformer);运行时 react-native-svg 走官方 web 构建

* `webSecurity: false`(见 4.2):保证 axios(插件跨域请求)与本地媒体可直连,与移动端行为一致

### 4.2 主进程 main.ts 关键点

```ts
app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
app.commandLine.appendSwitch('enable-features',
  'UseOzonePlatform,WaylandWindowDecorations,WaylandFractionalScaleV1');
```

* BrowserWindow(1100×700,min 380×600):`contextIsolation: true, sandbox: false, webSecurity: false, preload`

* 单实例锁(second-instance → 聚焦主窗口并转发深链)

* `app.setAsDefaultProtocolClient('musicfree')` + open-url/second-instance 处理 `musicfree://install/xxx`(与移动端 bootstrap 的 Linking 逻辑对齐,经 IPC 注入渲染进程)

* **媒体代理协议(保证原功能完整的关键)**:

  * `musicfree-http://<encoded-url>`:主进程 `net.fetch` 注入 track.headers(Referer/User-Agent/Authorization/Cookie)流式转发 → 解决 `<audio>` 无法自定义请求头的问题(音源站普遍校验 Referer/UA)

  * `musicfree-local://<path>`:本地文件流式读取(替代移动端 `file://` 播放与封面读取)

  * TrackPlayer shim 在 setQueue/load 时对带 headers 的 url 自动包装为代理 URL;`addFileScheme`(utils/fileUtils)在桌面 fs shim 中产生 `musicfree-local://` 前缀

* 退出前 flush MMKV 落盘

### 4.3 桌面歌词悬浮窗(替代 Android 状态栏歌词)

* 独立 BrowserWindow:transparent、frame: false、skipTaskbar、alwaysOnTop、可拖动

* 渲染端轻量歌词页订阅主进程广播的当前歌词行;样式(位置/宽度/字号/对齐/颜色)读 MMKV,与设置页 LyricUtil API 一一映射(`setStatusBarLyricTop/Left/Width/FontSize/Align/Colors`)

* **Wayland 限制与降级**:Wayland 协议无全局置顶(X11 下完整支持);GNOME 默认不支持置顶窗口(KDE 可用窗口规则强制)→ 提供「主窗口内歌词条」降级模式,并在 readme 说明各桌面环境行为

### 4.4 TrackPlayer shim(工作量最大的单点)

从 `src/core/trackPlayer/index.ts` + `src/service/index.ts` 逆向的必需 API:
`setupPlayer / updateOptions / setQueue / load / play / pause / stop / reset / seekTo / skip / getProgress / getRate / setRate / setVolume / getPlaybackState / getActiveTrack / getActiveTrackIndex / getTrack / updateMetadataForTrack / addEventListener / Event / State / Capability / AppKilledPlaybackBehavior / usePlaybackState / useProgress / registerPlaybackService`

语义对齐要点:

1. **fake-audio 机制**:上层用 `setQueue([真实track, fakeNext])` + `musicfree://fake-audio` 标记队尾。shim 中该 URL **不真正加载**,audio `ended`/`error` 时若当前 index=0 且队列[1].url 为 fake-audio → emit `Event.PlaybackActiveTrackChanged({index:1, lastIndex:0, track:queue[1]})`,由上层完成切歌(与 Android 行为一致)
2. `PlaybackProgressUpdated` 按 `progressUpdateEventInterval`(1s)发射;`PlaybackError` 在 audio error 时发射(保留 `android-io-file-not-found` 等上层判断逻辑兼容)
3. `Remote*` 事件 ← MediaSession actionHandler(play/pause/previoustrack/nexttrack/seekto/stop)→ 驱动 `src/service/index.ts` 的既有事件处理,同时作为 MPRIS 的操作入口
4. HLS(`.m3u8`,core 逻辑会标 `type:'hls'`)→ hls.js 附加到 audio 元素
5. `State` 枚举完整映射(Chromium audio 事件 → RNTP 状态机:None/Ready/Playing/Paused/Stopped/Buffering/Ended)
6. MediaSession metadata(title/artist/album/artwork/duration/position)同步 —— Chromium 自身据此对接 MPRIS/媒体键;自研 mpris.ts 补全 D-Bus 完整接口(SetPosition/Seek/Can\* 属性等)
7. 音频元素 crossorigin/预加载策略与媒体代理协议配合

### 4.5 MMKV shim 同步语义

* preload(sandbox: false)暴露 `desktopFs.readFileSync/writeFileSync/existsSync` + 异步 IPC

* MMKV 类:构造时同步读取 `userData/mmkv/<id>` JSON → 内存 Map;`set/delete/clearAll` 同步写回(`ipcRenderer.sendSync` 保证崩溃安全,单机桌面可接受;写操作合并优化留作后续)

* `addOnValueChangedListener` 本地 EventEmitter;主进程 `mmkv:changed` 广播保证歌词窗口与主窗口联动

### 4.6 构建与打包

* `desktop/package.json` 完全独立,根依赖不动 → 移动端零影响

* scripts:`desktop:dev`(webpack watch + electron)、`desktop:build`(webpack prod + electron-builder)

* electron-builder linux targets:**AppImage + deb**;category AudioVideo;AppImage 启动参数内置 `--ozone-platform-hint=auto`(Wayland/X11 自动适配)

* Node ≥ 18,Electron 最新稳定版

### 4.7 src/ 改动清单

**目标为零**。预期全部通过 alias + polyfills 吸收:

* `ErrorUtils.setGlobalHandler`(bootstrap.ts)→ desktop polyfills 提供全局 ErrorUtils

* `react-native-get-random-values` 副作用导入 → shim 自带副作用

* `Linking.getInitialURL/addEventListener` → rnw 有 web 实现,深链由主进程注入

* 若实施中遇到无法 shim 的硬阻塞(如某库顶层执行原生代码),允许在 src 内做**最小平台分支**(形如 `if (Platform.OS === 'web')`),须保持移动端行为逐字节不变并记录到变更日志;这是唯一允许修改 src 的例外通道

## 5. 风险与对策

| 风险                                           | 对策                                              |
| -------------------------------------------- | ----------------------------------------------- |
| react-native-svg web 构建在某些版本打包异常             | 备选:@svgr 直接把 svg 编译为 React 组件(项目 svg 均为静态资源,可行) |
| 音源站校验 Referer/UA/Cookie                      | musicfree-http\:// 主进程代理协议注入 headers(4.2)       |
| FlashList→FlatList 万级列表性能                    | 桌面性能余量大,可接受;后续可评估升级 flash-list v2(原生支持 web)     |
| MMKV sendSync 阻塞渲染                           | 单窗口桌面可接受;崩溃安全优先                                 |
| Wayland 下托盘(GNOME 需 AppIndicator 扩展)/悬浮窗置顶受限 | 文档说明 + 主窗口内歌词条降级;KDE/X11 完整支持                   |
| masked-view 蒙版降级导致少量视觉差异                     | 记录为已知差异,不阻塞                                     |

## 6. 实施顺序

1. **脚手架**:desktop/ 工程骨架 + webpack 别名表 + rnw 渲染出空白页
2. **基础 shim 批次**:polyfills / fs / mmkv / async-storage / device-info / netinfo / permissions / clipboard / get-random-values / splash-screen → 应用完整启动进入首页
3. **TrackPlayer shim + service 注册** → 播放/暂停/进度/切歌/状态持久化链路
4. **媒体代理协议 + HLS + headers 注入** → 真实插件音源播放
5. *@/native/* 桌面实现\*(NativeUtils/Mp3Util/LyricUtil)→ 本地音乐导入/元数据/内嵌歌词
6. **插件全链路验证**:URL/文件安装、搜索、歌单、榜单、导入、更新
7. **桌面集成**:托盘、MPRIS、桌面歌词窗口、通知、powerSaveBlocker、深链
8. **slider/fast-image/webview/image-colors/share/image-picker 等 UI 类 shim 收尾** → 设置页/主题/备份(webdav)/下载全功能
9. **打包**:electron-builder AppImage/deb + Wayland/X11 会话冒烟
10. **回归**:移动端构建冒烟(验证 src/ 零改动)、更新 readme 构建说明

## 7. 验证步骤

### 7.1 无头环境自动化验证(已完成)

通过 `desktop/src/main/verify.ts`(复用真实应用的 IPC/媒体代理初始化路径)+ Xvfb/Weston headless + dbus-daemon,注入 executeJavaScript 探针完成:

| 验证项                                                                  | 结果                                                                                                   |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| X11 渲染(Xvfb)                                                         | ✅ root 挂载、19 个 SVG 图标(react-native-svg web 实现)、完整主界面(搜索/推荐歌单/榜单/本地音乐/设置侧栏)                           |
| Wayland 渲染(Weston headless + `ELECTRON_OZONE_PLATFORM_HINT=wayland`) | ✅ 同上全部通过,无 X11 回退错误                                                                                  |
| Bootstrap                                                            | ✅ 权限/文件夹/配置/插件/播放器/播放列表/歌词/本地音乐/主题/语言全部初始化完成                                                         |
| 插件系统 UI + 路由                                                         | ✅ 点击"插件管理"成功导航,页面显示订阅设置/插件排序/卸载全部插件                                                                  |
| 能力探针                                                                 | ✅ MediaSession / HTML5 Audio / localStorage 全部可用                                                     |
| MPRIS D-Bus                                                          | ✅ `org.mpris.MediaPlayer2.musicfree` 注册成功;PlaybackStatus/CanControl/CanQuit/CanRaise/Identity 属性查询正常 |
| 播放链路                                                                 | ✅ `musicfree-local://` 协议播放本地 MP3:currentTime 精确推进、duration 正确解析、readyState=4、零错误                    |
| 移动端零影响                                                               | ✅ `git status` 确认 `src/`、`android/`、`ios/`、`metro.config.js` 无改动                                     |

验证命令(X11):

```bash
cd desktop && npm run build:main
DISPLAY=:95 electron dist/main/verify.js --no-sandbox
```

Wayland 验证(需 weston headless):

```bash
XDG_RUNTIME_DIR=/tmp/xdg WAYLAND_DISPLAY=wayland-0 DISPLAY= \
  ELECTRON_OZONE_PLATFORM_HINT=wayland electron dist/main/verify.js --no-sandbox
```

关键注意:`ELECTRON_OZONE_PLATFORM_HINT` 必须作为环境变量在进程启动前传入(main.ts 对打包后无脚本包装的场景通过 spawn 自重启补上)。

### 7.2 真实环境人工验证(待完成)

1. Wayland 会话 `desktop:dev` 启动,确认 ozone=wayland 生效;X11 会话同样跑通
2. 播放链路:安装社区插件(URL + 本地文件两种方式)→ 搜索 → 播放(含带 Referer 校验的源)→ 暂停/拖动/上一首/下一首/音质切换/倍速
3. 队列语义:顺序循环/单曲循环/随机,播到队尾自动切歌(fake-audio 路径)、播放出错自动跳下一首
4. 本地音乐:导入 mp3/flac → 元数据、封面、内嵌歌词读取;下载歌曲 → 写入标签
5. 歌词:桌面歌词窗口(位置/字号/颜色/对齐设置联动)、关联歌词、翻译显示
6. 桌面集成:`playerctl play/pause/next/metadata` 验证 MPRIS;托盘菜单;媒体键;最小化到托盘;下载完成通知
7. 数据:主题/背景/字体设置、webdav 备份恢复、定时关闭、历史记录
8. **移动端回归**:`npm run android` 构建并冒烟
9. AppImage 在 GNOME(Wayland)、KDE(Wayland)、X11 三环境冒烟

## 8. 假设与决策(已定)

* 技术路线:Electron + react-native-web(用户确认);功能范围:完整桌面体验(用户确认)

* `env.os` / `process.platform` 对插件保持上报 `"android"`(现状即如此,最大化原插件兼容)

* `webSecurity: false`(桌面单体应用可接受;外链一律经主进程 `shell.openExternal` 白名单打开)

* src/ 零修改为目标;唯一例外通道见 4.7

* 分发格式:AppImage + deb;不引入 Flatpak(后续可选)

