# iOS 版交接说明（给接手的开发 bot）

## 目标

把官方 MusicFree（React Native 0.76 + TypeScript）做成能在 iPhone 上日常使用的 iOS App。
上游 README 写明只支持 Android / HarmonyOS，`ios/` 目录原本只是 RN 脚手架、从未编译通过。

## 仓库与分支

| 项 | 值 |
| --- | --- |
| 本地路径 | `~/code/musicfree-ios` |
| 上游 | `https://github.com/maotoumao/MusicFree`（remote `upstream`，master） |
| 你的 fork | `https://github.com/data-cd-sky/MusicFree`（remote `origin`） |
| 工作分支 | `ios/port`（已推送，跟踪 origin/ios/port） |
| 基线版本 | 上游 master `d118b18`（v1.0.0-beta.4 之后） |

提交规范由 husky + commitlint 强制，`type` 只能是：
`ci | chore | docs | feat | fix | perf | refactor | revert | style`（没有 `build`）。

推送用 HTTPS + gh 凭据（`gh auth setup-git` 已执行过，账号 `data-cd-sky` 已登录）。

## 本机环境（已就绪）

- macOS 26.6.2，Xcode 27.2（iOS 27.2 SDK）
- Node 22.22，npm 10.9；CocoaPods 1.17（brew 安装）；Watchman 已装（Metro 必需）
- `npm ci` 与 `pod install` 都已完成，`ios/Pods` 已生成
- Metro 由 Codync 托管在 8081 端口（任务名 `musicfree-metro`）
- iOS 27.2 模拟器已就绪：通用版 runtime 24B8117，验证机为 iPhone 17 Pro Max
  （UDID `9959CA3C-AA80-4485-BED0-4E680F998704`）
- 本机 Xcode 27 只有 headless CoreSimulator（没有 Simulator.app），
  无法点击屏幕或锁屏；只能用 `simctl` 启动/截图、用 Metro CDP 驱动 JS

## 构建命令

```bash
cd ~/code/musicfree-ios

# 只验证编译（不需要签名，已通过）
xcodebuild -workspace ios/MusicFree.xcworkspace -scheme MusicFreeNew \
  -configuration Debug -sdk iphoneos -derivedDataPath /tmp/mf-dd \
  CODE_SIGNING_ALLOWED=NO build

# JS 打包自检
npx react-native bundle --platform ios --dev false --entry-file index.js \
  --bundle-output /tmp/main.jsbundle --assets-dest /tmp/mf-assets

# 真机（需要 Xcode 已登录 Apple ID，签名团队从钥匙串读）
npx react-native run-ios --device "<iPhone 名称>"
```

## 已经做完的改动

1. `ios/Podfile`：App target 最低 iOS 16.2；`post_install` 把所有 Pod 的
   `IPHONEOS_DEPLOYMENT_TARGET` 留在 15.1，解决 Xcode 27 拒绝低版本 Pod
   （原报错来自 MMKV/RNSVG/RNDeviceInfo 等）。Pod 都不链接 ActivityKit，
   不影响 App 的 16.2 可用性。
2. `ios/MusicFreeNative/`：新增本地 Pod，补齐三个原本只有 Kotlin 实现的原生模块
   - `NativeUtils`：`exitApp`（iOS 上退到后台）、`checkStoragePermission`（沙盒恒 true）、
     `getWindowDimensions`（阻塞式同步方法）
   - `Mp3Util`：AVFoundation 读取标题/歌手/专辑/时长/内嵌封面/内嵌歌词；
     `setMediaTag` 目前只对 m4a/mp4 放行且未实现写入
   - `LyricUtil`：iOS 上把原「状态栏歌词」调用链桥接到 ActivityKit 实时活动
     （`MFLyricUtil.swift` + `MFLiveActivity.swift`）；iOS 没有悬浮窗权限，
     `checkSystemAlertPermission` 返回实时活动是否可用
3. `src/entry/bootstrap/bootstrap.ts`：存储权限分支只在 Android 执行（iOS 原来会抛错闪退）
4. `src/components/panels/base/panelBase.tsx`：窗口高度改用 `getWindowDimensions`，
   缺失时回退 `Dimensions.get("window")`
5. `src/pages/fileSelector/index.tsx`：iOS 从沙盒 `Documents` 开始浏览
6. `src/pages/setting/settingTypes/basicSetting.tsx`：「状态栏歌词」分组改为跨平台，
   iOS 显示「实时活动歌词」开关，Android 仍为原来的状态栏歌词设置
7. `ios/MusicFree/Info.plist`：后台音频、Files App 文件共享（`UIFileSharingEnabled` +
   `LSSupportsOpeningDocumentsInPlace`）、相册权限说明、`NSAllowsArbitraryLoadsForMedia`
8. Bundle ID 改为 `fun.upup.musicfree`；AppIcon 全尺寸已生成（源图是 512 的 Android 图标放大）
9. `ios/MusicFreeLiveActivity/`：新增 Widget Extension（ActivityKit + WidgetKit），只做实时活动
   （target 名沿用已有的 `MusicFreeLiveActivity`，功能等价于建议的 `MusicFreeLyricWidget`）：
   锁屏显示三行歌词 + 进度条 + 播放/暂停，灵动岛 compact 显示当前歌词，
   expanded 显示上一句/当前/下一句 + 歌名歌手 + 播放/暂停按钮；
   `ContentState` 字段为 `title`、`artist`、`lyricLine`、`previousLine`、`nextLine`、
   `progress`、`isPlaying`；原生层把更新限流到 ≥1s/次。按钮通过
   `musicfree://toggle-play` deep link 回到 App 切换播放。
   App 冷启动时 `MFLiveActivity.cleanupOrphans()` 清理上次进程残留的活动。
10. 设置页新增 iOS 专用的「实时活动歌词」开关（`src/pages/setting/settingTypes/basicSetting.tsx`），
    系统不允许实时活动时显示提示
11. iOS 最低版本 **16.2**（ActivityKit 的 `ActivityContent` 要求），App 与 Widget
    Extension 均为 16.2，低于 16.2 的设备不支持实时活动歌词；代码统一使用
    `ActivityContent` API，不保留 16.1 分支。
12. `ios/MusicFreeNative/MFMp3Util.mm`：m4a/mp4 的 `setMediaTag` 用
    `AVAssetExportSession` 重写 metadata（title/artist/album/comment/lyric），
    先导出到同目录临时文件再原子替换原文件，失败不会破坏原文件；
    `getMediaTag` 同步补上 comment 读回；MP3 明确 reject 并返回可读错误。
13. `src/core/pluginManager/plugin.ts`：全局 `axios.defaults.timeout` 从 2s 调到 10s。
    2s 会让稍慢的插件接口（尤其境外 API）在搜索、插件安装时被误判为超时，实测
    udio 搜索耗时约 2.2s 时稳定报 `timeout of 2000ms exceeded`；改后正常。

## 当前卡点（不是代码问题）

- **签名**：`security find-identity -v -p codesigning` 为 0，Xcode 尚未登录 Apple ID，
  所以还不能装真机。需要用户在 Xcode → Settings → Accounts 登录（免费账号即可）。
- **真机连接**：`xcrun devicectl list devices` 为空，需要数据线连接 + 信任 + 开发者模式。
- **模拟器**：iOS 27.2 有两个 runtime：按机型的 24B91014 只支持 iPhone Duo；
  通用版 24B8117 支持 iPhone 15–18 全系。当前验证机为 iPhone 17 Pro Max
  （UDID `9959CA3C-AA80-4485-BED0-4E680F998704`），启动和主要功能已验证，见下方进展。
  截图用 `xcrun simctl io <UDID> screenshot <file>`，17 Pro Max 不需要 `--display`；
  iPhone Duo 上 App 画面在 `--display=1`（不是 3）。iPhone Duo 已关机，不要启动。

## 接手进展（2026-11-15）

- 模拟器已跑通：iPhone Duo（iOS 27.2）上 App 能启动，bootstrap 全流程通过，
  首页正常渲染，`Documents/log` 无 JS 错误。
- 关键决定：iOS 端关闭 New Architecture（`ios/Podfile` 中 `ENV['RCT_NEW_ARCH_ENABLED'] = '0'`）。
  react-native-mmkv 2.x 需要 legacy bridge；RNTP 4.x 的 iOS 模块缺少 RN 0.76
  TurboModule 互操作会解析的方法。
- iOS 27 SDK 必须使用 UIScene 生命周期：窗口改由 `AppDelegate.mm` 里的 `SceneDelegate`
  创建（含冷启动 deep link 的 launchOptions 转发）；`expo-splash-screen` 需要
  `SplashScreen.storyboard` 资源。
- `react-native-permissions` 改为只在 Android 分支 require，避免 iOS 读取不存在的权限 handler。
- 已在模拟器验证：本地音乐导入（Documents → 扫描 → Mp3Util 元数据）、本地音乐播放、
  后台播放（切到别的 App 后进度继续）、`musicfree://install/<url>` 热启动安装插件、
  RNFS 下载到 Documents/download。
- 17 Pro Max 复跑一轮（2026-11-15，截图留证）：冷启动首页正常；从 Documents 递归导入
  3 个本地音频（wav/m4a）加上之前下载的 m4a，共 4 首；本地限速 HTTP 服务下载 1.3MB wav，
  「正在下载」显示 240.0KB / 1.3MB，完成后落到 Documents/download/music 并加入本地歌单；
  播放 30s 本地歌曲后切到「设置」App，进度从 2.7s 继续到 16.9s，回到前台播放页正常；
  `musicfree://install/` 的 URL 由系统弹出「在 MusicFree 中打开?」确认框，
  headless 环境无法点按，改为通过 Metro CDP 触发同一个 `Linking` url 事件完成安装，
  插件管理页出现 VerifyPluginInstall（0.0.1）。整轮 Documents/log 无 JS 错误。
- 实时活动歌词已完成并在 iPhone 17 Pro Max 验证（2026-11-15，最低 iOS 16.2）：播放 0.3s/行的
  测试 `.lrc`，`[MFLiveActivity] update` 日志显示实际更新间隔约 1.00s，content state 同时携带
  上一句/下一句/进度/播放状态；暂停/继续时日志分别为 `playing=false` / `playing=true`；
  关闭开关触发 `end count=1 reason=disabled` 和 ActivityKit `Ending activity`；
  强杀 App 后重启，日志为 `cleanup class=MFLiveActivity` + `end count=1 reason=orphan-cleanup`，
  旧活动消失且不会自动新建；chronod 日志显示 Widget Extension reload 成功
  （activity archive 约 53KB）。改为 16.2 API 后在最终 Debug 构建上复测：
  `start title=MF标签标题`、三行歌词 update、`playing=true/false` 均正常。
  由于 Xcode 27 没带 Simulator.app（只有 headless CoreSimulator），无法锁屏或点击，
  锁屏/灵动岛的视觉效果与播放按钮的点按仍需真机或带 Simulator UI 的环境复核；
  播放按钮的 URL 处理已通过 Metro CDP 触发同一个 `Linking` 事件验证。
- m4a 标签写入已在 iPhone 17 Pro Max 模拟器验证（2026-11-15）：对 `Documents/test-tone.m4a`
  调用 `setMediaTag` 写入 title/artist/album/comment/lyric（含中文）后，`getMediaTag` 读回
  `{"title":"MF标签标题","artist":"MF标签歌手","album":"MF标签专辑","comment":"这是备注","lyric":"..."}`，
  `getBasicMeta` 读回 title/artist/album 且时长仍为 3000ms；只传 `title` 时
  artist/album/comment/lyric 保持不变（保留逻辑已实测）；TrackPlayer 播放到
  `playing`（进度 1.73s），播完后 active track 标题为「MF标签标题」。
  MP3 返回 `Unsupported ... .mp3` 且文件哈希不变；对损坏的 `.m4a` 导出失败（`ExportFailed`）后
  原文件内容与哈希不变、无临时文件残留。
- 设置页新增「实时活动歌词」开关，截图确认开关、说明文字正常显示，默认关闭。
- 真机构建：Debug / Release 的 `iphoneos` 无签名编译均通过；App 与 Widget Extension 的
  `IPHONEOS_DEPLOYMENT_TARGET` 均为 16.2，Release 产物内嵌
  `MusicFreeLiveActivity.appex`（arm64，MinimumOSVersion 16.2）；ActivityKit 在 App 与
  扩展二进制中都是 `LC_LOAD_DYLIB`（强链接，不是弱链接）。Pods 保持 15.1，
  且没有 Pod 链接 ActivityKit。
- 仍未验证：真机后台播放/锁屏控制/耳机线控/来电打断（等签名与设备）；
  MP3 ID3 写入仍不支持（m4a/mp4 已完成，见上）。
- 核心使用链路（2026-11-15，iPhone 17 Pro Max 模拟器）：官方插件源
  `maotoumao/MusicFreePlugins` 的示例插件当前基本不可播放——Audiomack 播放接口 403；
  bilibili 的 `.m4s` 被 AVPlayer 判为无法识别（-11828）；猫耳FM 的 HLS 是
  SAMPLE-AES/Widevine DRM，AVPlayer 无 FairPlay 解密能力；快手搜索返回 0；
  YouTube 播放接口要求登录；音悦台在本机网络 TLS 不可达；suno 503。
  改用公开插件源 `qwerwhr/musicfree-plugins` 的 `GD音乐台`（https API，
  netease 源）跑通：搜索「晴天」返回 20 条，点播 270.7s 的 https MP3，
  `playing` 且进度正常；歌词页自动加载并高亮当前行；音质 `standard → high`
  切换后进度保持在 93.05s 并继续播放；上一首/下一首正常；加入「我喜欢」后
  首页显示 1 首；播放历史记录了本轮的 5 首歌。GD 插件的音质映射本身有 bug
  （所有档位都回 320），属插件侧问题。两个 App 侧的小问题：搜索页已经打开时
  再安装插件，插件 tab 不会刷新（`ResultPanel` 的 memo 没有依赖插件列表），
  重新进入搜索页即可；冷启动恢复上次歌曲后歌词不会自动加载，歌词页显示
  「暂无歌词/搜索歌词」，需要手动搜索或重新播放。
- 修复 iOS 播放失败不自动跳下一首（2026-11-15）：RNTP iOS 的
  `playback-error` 事件 payload 只有 `{ error: <SwiftAudioEx 文案> }`，没有
  `message`/`code`，而 `src/core/trackPlayer/index.ts` 的判断依赖 `e.message`，
  条件恒为 false。改为 `e.message || e.error` 并补上 `error` 的类型；实测播放
  返回 403 的 udio 源后 500ms 自动跳到下一首本地歌曲，状态从 `error` 恢复为
  `playing`，且只跳一首（iOS 同一次失败会发两次事件，第二次到达时当前曲已变化，
  不会重复处理）。
- 断网/弱网：NetInfo 读取到 `Wifi`；搜索请求失败时结果页显示「出错啦…/点击重试」，
  修好超时后重试可以恢复；播放失败仍没有 Toast，也没有全局离线提示；修复事件
  字段后会在 500ms 后自动跳下一首。建议后续补一个播放失败 Toast（最小改动）。
- 本地音乐：从 Files 拖音频到 `Documents` 根目录后，「扫描本地音乐」的选择器
  因 `fileType: "folder"` 只列文件夹，既不能选 `Documents` 本身，也看不到根目录
  里的音频文件；必须先建子文件夹或放进 `download` 才能扫描。最小改动方案：把
  `src/pages/localMusic/mainPage/index.tsx` 里扫描的 `fileType` 改成
  `"file-and-folder"`（并加音频后缀过滤），即可在根目录直接多选文件。
- 下载完成只有 Toast「下载任务已完成」，没有「在 Files 中查看」引导；文件实际在
  `Documents/download/music`，Files App 的「我的 iPhone → MusicFree」可见。
  最小改动：在完成 Toast 或下载列表页补一句路径说明；iOS 不能深链到具体文件夹。
- 启动图：冷启动为白色 MusicFree 启动图约 0.6s，随后进入深色首页；无黑屏、
  无空白白屏。深色主题下白色启动图到深色首页的过渡较明显，若要统一可改
  `SplashScreen.storyboard` 背景色（等图标/素材一起处理）。
- 注意：ATS 仍禁止明文 HTTP（`NSAllowsArbitraryLoads` 为 false），只开了
  `NSAllowsLocalNetworking`（Metro/本机测试）与 `NSAllowsArbitraryLoadsForMedia`；
  远程 http 插件 API 仍会失败，遇到只记录、不私自放开，是否允许需用户确认。

## 建议的下一步（按优先级）

**P0 跑起来**
1. 模拟器可用后先用模拟器验证启动链路：权限分支、MMKV、TrackPlayer 初始化、路由、抽屉
2. 真机签名就绪后装到 iPhone，重点验证：后台播放、锁屏控制、耳机线控、来电打断
3. 修启动/运行时崩溃（错误日志在 `Documents/log/`，ErrorUtils 全局捕获）

**P1 功能补全**
4. 本地音乐：从 Files App 导入（现在 App 的 Documents 已暴露）、封面、内嵌歌词
5. 下载：确认 `RNFS.downloadFile` 在 iOS 的路径与「导出到文件 App」体验
6. 插件安装/订阅在 iOS 上的文件选择链路

**P2 iOS 独有能力**
7. 灵动岛/实时活动歌词：已完成（ActivityKit + Widget Extension，iOS 16.2+，
   低于 16.2 的设备不支持；1s 更新限流、暂停状态、三行歌词、播放/暂停 deep link、
   冷启动孤儿清理）；真机上的锁屏/灵动岛视觉与按钮点按待复核
8. m4a/mp4 标签写入已实现（`MFMp3Util.mm`，见「已经做完的改动」第 12 条）；
   MP3 的后续方案评估：推荐引入 ID3TagEditor（Swift，中等工作量），
   TagLib 需要 C++ 桥接、成本高，自研 ID3v2 风险高。注意 `setMediaTag`
   目前没有任何 JS 调用方，先等「编辑标签」入口明确后再接 UI。
9. 品质打磨：图标重绘（现在是把 512 图标放大）、启动图、ATS 收紧

## 协作约定

- 仓库文件归接手的 bot 所有；交接方不再改这个目录，避免冲突
- 不要在别人的 `~/.codync` 目录下写文件；所有产物放 `~/code/musicfree-ios`
- `pod install` 会改 `project.pbxproj` 和 `PrivacyInfo.xcprivacy`，属正常，提交即可
- `ios/MusicFree.xcworkspace/` 已加入 `.gitignore`（由 pod install 生成）
- 每次提交前 `npm run lint` 会自动跑（lint-staged），提交信息用上面的 type
