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
- iOS 27.2 模拟器 runtime 正在后台下载（任务名 `ios-simulator-runtime`，8GB，很慢）

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

1. `ios/Podfile`：`post_install` 把所有 Pod 的 `IPHONEOS_DEPLOYMENT_TARGET` 统一到 15.1，
   解决 Xcode 27 拒绝低版本 Pod（原报错来自 MMKV/RNSVG/RNDeviceInfo 等）。
2. `ios/MusicFreeNative/`：新增本地 Pod，补齐三个原本只有 Kotlin 实现的原生模块
   - `NativeUtils`：`exitApp`（iOS 上退到后台）、`checkStoragePermission`（沙盒恒 true）、
     `getWindowDimensions`（阻塞式同步方法）
   - `Mp3Util`：AVFoundation 读取标题/歌手/专辑/时长/内嵌封面/内嵌歌词；
     `setMediaTag` 目前只对 m4a/mp4 放行且未实现写入
   - `LyricUtil`：占位，`checkSystemAlertPermission` 返回 false
3. `src/entry/bootstrap/bootstrap.ts`：存储权限分支只在 Android 执行（iOS 原来会抛错闪退）
4. `src/components/panels/base/panelBase.tsx`：窗口高度改用 `getWindowDimensions`，
   缺失时回退 `Dimensions.get("window")`
5. `src/pages/fileSelector/index.tsx`：iOS 从沙盒 `Documents` 开始浏览
6. `src/pages/setting/settingTypes/basicSetting.tsx`：「状态栏歌词」分组只在 Android 显示
7. `ios/MusicFree/Info.plist`：后台音频、Files App 文件共享（`UIFileSharingEnabled` +
   `LSSupportsOpeningDocumentsInPlace`）、相册权限说明、`NSAllowsArbitraryLoadsForMedia`
8. Bundle ID 改为 `fun.upup.musicfree`；AppIcon 全尺寸已生成（源图是 512 的 Android 图标放大）

## 当前卡点（不是代码问题）

- **签名**：`security find-identity -v -p codesigning` 为 0，Xcode 尚未登录 Apple ID，
  所以还不能装真机。需要用户在 Xcode → Settings → Accounts 登录（免费账号即可）。
- **真机连接**：`xcrun devicectl list devices` 为空，需要数据线连接 + 信任 + 开发者模式。
- **模拟器**：iOS 27.2 有两个 runtime：按机型的 24B91014 只支持 iPhone Duo；
  通用版 24B8117 支持 iPhone 15–18 全系。当前验证机为 iPhone 17 Pro Max
  （UDID `9959CA3C-AA80-4485-BED0-4E680F998704`），启动和主要功能已验证，见下方进展。

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
- 真机构建：Debug / Release 的 `iphoneos` 无签名编译均已通过（Release 带 JS bundle）。
- 仍未验证：真机后台播放/锁屏控制/耳机线控/来电打断（等签名与设备）；
  Live Activity 歌词、MP3 ID3 写入（P2）。
- 注意：ATS 仍禁止明文 HTTP（`NSAllowsArbitraryLoads` 为 false），插件 API 若走 http 会失败；
  是否放开需用户决定（Android 侧允许 cleartext）。

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
7. 灵动岛/实时活动歌词（ActivityKit + Widget Extension，替代 Android 悬浮窗歌词）
8. MP3 ID3 写入（TagLib 或自研 ID3v2）
9. 品质打磨：图标重绘（现在是把 512 图标放大）、启动图、ATS 收紧

## 协作约定

- 仓库文件归接手的 bot 所有；交接方不再改这个目录，避免冲突
- 不要在别人的 `~/.codync` 目录下写文件；所有产物放 `~/code/musicfree-ios`
- `pod install` 会改 `project.pbxproj` 和 `PrivacyInfo.xcprivacy`，属正常，提交即可
- `ios/MusicFree.xcworkspace/` 已加入 `.gitignore`（由 pod install 生成）
- 每次提交前 `npm run lint` 会自动跑（lint-staged），提交信息用上面的 type
