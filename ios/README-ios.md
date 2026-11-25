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
git clone https://github.com/maotoumao/MusicFree.git
cd MusicFree
git switch feat/ios-port
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
  - `LyricUtil`：iOS 上没有悬浮窗，把「状态栏歌词」桥接到 ActivityKit 实时活动
- 启动逻辑里的 Android 存储权限申请改为仅在 Android 执行（原来在 iOS 会直接抛错）
- 面板高度获取窗口尺寸增加 RN `Dimensions` 兜底
- 本地文件选择器在 iOS 上从 App 沙盒 `Documents` 开始浏览
- 设置页在 iOS 上显示「实时活动歌词」开关，Android 仍是原来的状态栏歌词设置
- `ios/MusicFreeLiveActivity/`：Widget Extension，锁屏三行歌词 + 进度条 + 播放/暂停，
  灵动岛 compact 显示当前歌词，expanded 显示上一句/当前/下一句
- `Info.plist`：后台音频、Files App 文件共享、相册权限说明、允许媒体走 HTTP
- Bundle ID 改为 `fun.upup.musicfree`，补齐 AppIcon 全部尺寸
- `src/core/pluginManager/plugin.ts`：允许插件把运行期数据写回自己的用户变量
  （网易云扫码登录后凭证不再只存在内存里）
- `src/core/trackPlayer/index.ts`：只把网易云 `m*.music.126.net` 的 http 地址升级为 https，
  绕开 iOS ATS；其他 http 源不动，且该逻辑仅在 iOS 生效

## 测试结果

构建与静态检查：

| 项目 | 结果 |
| --- | --- |
| Debug `iphoneos` 无签名编译 | `BUILD SUCCEEDED`，最低版本 16.2 |
| Release `iphoneos` 无签名编译 | `BUILD SUCCEEDED`，App 与 Widget `.appex` 均为 16.2 |
| 真机自签构建 + 覆盖安装 + 启动 | 通过（iPhone 17 Pro Max，iOS 27.2） |
| 每周续签覆盖安装 | 通过，歌单/插件/已下载文件均保留 |
| `npx tsc --noEmit` | 0 错误 |
| `npx jest` | 5 suites / 18 tests 全过 |
| React Native bundle（ios / android） | 均通过 |

功能验证（iPhone 17 Pro Max 模拟器，iOS 27.2）：

| 项目 | 结果 |
| --- | --- |
| 冷启动、启动图（深色/浅色） | 通过 |
| 插件搜索、插件增删 | 通过 |
| 在线播放（GD 音乐台、Audiomack …） | 通过 |
| 歌词加载、自动搜歌词、音质切换 | 通过 |
| 网易云：搜索 / 公开歌单导入 / http→https 取流 | 通过 |
| 网易云 Cookie 透传、扫码登录（801 轮询） | 通过 |
| 本地音乐导入（单文件 / 文件夹递归）、播放 | 通过 |
| 下载到 `Documents/download/music` | 通过 |
| 播放失败提示与自动跳歌 | 通过 |
| 实时活动歌词（update / 结束 / 重启清理） | 通过 |

真机补充验证（iPhone 17 Pro Max，iOS 27.2，自签 Release 包）：

| 项目 | 结果 |
| --- | --- |
| 后台播放（切到其他 App / 锁屏后继续） | 通过 |
| 锁屏控制（锁屏播放控件：播放/暂停、上一首/下一首） | 通过 |
| 实时活动歌词（锁屏显示与灵动岛视觉） | 通过 |
| 实时活动播放/暂停按钮点按 | 通过 |
| 来电打断后恢复：挂断后自动继续播放 | 通过 |

上表为 Mac 连接 iPhone 开发过程中的人工实测结果。

以下三项**未测试**（模拟器和真机都没有单独测过，不代表已支持或已修复）：
耳机线控、Files 文件选择器、分享/导出。

## 待办

- **写音频标签**：AVFoundation 只能重写 m4a/mp4 容器；MP3 的 ID3 写入需要引入 TagLib 或
  自己实现 ID3v2 写入
- **CarPlay / 小组件**：上游没有，属于 iOS 独有能力
- **ATS**：目前只对媒体放开 HTTP，插件接口如果走 HTTP 需要单独评估
- **最低版本**：当前为 iOS 16.2，更低版本未验证
