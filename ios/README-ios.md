# MusicFree iOS 移植说明

本目录把官方 MusicFree（React Native + TypeScript）移植到 iOS。上游 README 写明只支持
Android / HarmonyOS，iOS 目录原本只是 React Native 脚手架，从未编译通过。这里记录当前状态
和后续工作，方便继续开发。

**安装 / 签名 / 免费 7 天与付费 1 年版说明见 [INSTALL-zh.md](./INSTALL-zh.md)。**

## 环境要求

- macOS + Xcode（当前验证：Xcode 27.2 / iOS 27.2 SDK）
- Node.js >= 18
- CocoaPods >= 1.16
- Watchman（Metro 需要，否则容易 EMFILE 报错）

```bash
cd ~/code/musicfree-ios
npm ci
cd ios && pod install && cd ..
```

## 构建与运行

```bash
# 真机（需在 Xcode 里登录 Apple ID 生成签名）
npx react-native run-ios --device "你的 iPhone 名称"

# 模拟器（需要先在 Xcode → Settings → Components 里安装 iOS Simulator）
npx react-native run-ios --simulator "iPhone 17"

# 不开签名、只验证编译
xcodebuild -workspace ios/MusicFree.xcworkspace -scheme MusicFreeNew \
  -configuration Debug -sdk iphoneos -derivedDataPath /tmp/mf-dd \
  CODE_SIGNING_ALLOWED=NO build
```

Metro 单独启动：`npm start`。

## 已完成

- Pod 部署目标统一到 15.1，修复 Xcode 27 拒绝低版本 Pod 的问题
- `ios/MusicFreeNative` 本地 Pod，补齐三个原本只有 Android 实现的原生模块：
  - `NativeUtils`：窗口尺寸、退出 App（iOS 上退到后台）、存储权限（沙盒恒为 true）
  - `Mp3Util`：用 AVFoundation 读取本地音频的标题/歌手/专辑/时长、内嵌封面、内嵌歌词
  - `LyricUtil`：占位实现，暂时不支持状态栏歌词
- 启动逻辑里的 Android 存储权限申请改为仅在 Android 执行（原来在 iOS 会直接抛错）
- 面板高度获取窗口尺寸增加 RN `Dimensions` 兜底
- 本地文件选择器在 iOS 上从 App 沙盒 `Documents` 开始浏览
- 设置页的「状态栏歌词」分组仅在 Android 展示
- `Info.plist`：后台音频、Files App 文件共享、相册权限说明、允许媒体走 HTTP
- Bundle ID 改为 `fun.upup.musicfree`，补齐 AppIcon 全部尺寸

## 待办

- **灵动岛 / 实时活动歌词**：iOS 没有悬浮窗，状态栏歌词的正解是 ActivityKit Live Activity +
  Widget Extension，需要新增 target
- **写音频标签**：AVFoundation 只能重写 m4a/mp4 容器；MP3 的 ID3 写入需要引入 TagLib 或
  自己实现 ID3v2 写入
- **后台播放验证**：快进/切歌/锁屏控制需要在真机上过一遍
- **CarPlay / 小组件**：上游没有，属于 iOS 独有能力
- **ATS**：目前只对媒体放开 HTTP，插件接口如果走 HTTP 需要单独评估
