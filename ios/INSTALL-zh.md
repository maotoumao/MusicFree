# MusicFree iOS 编译、签名与安装

本仓库只提供源码，**不提供签名好的 IPA**。iOS 必须用你自己的 Apple ID 签名后才能安装。
本文只讲“自己签名安装”，不使用 TestFlight，也不做 App Store / Ad Hoc 分发。

## 先选账号

| 账号 | 签名有效期 | 说明 |
| --- | --- | --- |
| 免费 Apple ID（Xcode Personal Team） | 7 天 | 适合先试用；到期后每周重新签名安装 |
| 付费 Apple Developer Program | 开发描述文件 1 年 | 适合长期自用；到期前重新签名即可 |

“付费 1 年版”不是单独的安装包，而是开发描述文件的有效期是 1 年。个人自用直接用
Development 签名即可，不需要上架 App Store，也不需要 TestFlight。

TestFlight 本身也要求付费 Apple Developer Program，免费 Apple ID 不能用；TestFlight
构建 90 天过期，外部测试还要 Beta App Review。本项目不采用 TestFlight 分发。

> 免费账号签名只适用于你自己的设备，不能把签好的 App 发给别人；也不要用别人的证书或
> 描述文件。仓库采用 AGPL-3.0，二次分发请保留出处。

## 环境要求

- macOS + Xcode（当前验证：Xcode 27.2 / iOS 27.2 SDK）
- Node.js 22 LTS
- CocoaPods >= 1.16（当前验证 1.17）
- Watchman（Metro 需要）
- iPhone：iOS 16.2 及以上，打开“开发者模式”，并信任这台 Mac
- Xcode 已登录 Apple ID：Xcode → Settings → Accounts（免费账号即可）

更低版本的 Xcode 未验证；如果编译报 SDK/API 错误，请先升级到 Xcode 27.2 再试。

## 方案 A：Mac + Xcode（推荐）

### 1. 拉代码并安装依赖

```bash
git clone https://github.com/maotoumao/MusicFree.git
cd MusicFree
git switch feat/ios-port

npm ci
cd ios
pod install
cd ..
```

`npm ci` 会执行 `scripts/apply-react-native-patches.js`，给 react-native 的 iOS 网络层
打 Cookie 透传补丁。如果这一步报“找不到代码块”，说明 `node_modules` 里的 RN 版本和
补丁不匹配，先不要继续，退回对应 commit 或提 issue 附完整日志。

### 2. 在 Xcode 里配置签名

```bash
open ios/MusicFree.xcworkspace
```

1. 左上角 Scheme 选 **MusicFreeNew**。
2. 左侧项目导航选 **MusicFree** 项目 → TARGETS → **MusicFree** →
   **Signing & Capabilities**：
   - 勾选 **Automatically manage signing**
   - **Team** 选你自己的 Personal Team / 付费团队
3. 再选 TARGETS → **MusicFreeLiveActivity**，Team 选同一个。
4. 如果 Xcode 提示 bundle identifier 不可用，把两个 target 改成你自己的唯一 ID：
   - App：`com.yourname.musicfree`
   - Widget：`com.yourname.musicfree.liveactivity`

改 bundle ID 后，旧 App 的数据不会自动迁移；同一个 bundle ID 覆盖安装才会保留歌单、插件
和登录态。

### 3. 安装到 iPhone

1. 用数据线连接 iPhone，手机上点“信任”，输入锁屏密码。
2. iPhone → 设置 → 隐私与安全性 → **开发者模式** → 打开，按提示重启并确认。
3. Xcode 顶部运行目标选你的 iPhone，按 **⌘R**。
4. 首次启动如果提示“不受信任的开发者”，到 iPhone：

   **设置 → 通用 → VPN 与设备管理 → 开发者 App →
   Apple Development: 你的邮箱 → 信任**

   然后回到桌面打开 MusicFree。

### 4. 免费账号：7 天到期后重签

免费 Personal Team 的开发描述文件 **7 天过期**，到期后 App 会打不开，这是正常限制。
重新签名即可，数据不会丢：

```bash
cd ~/code/MusicFree
git switch feat/ios-port
# 确认手机已连接/解锁
scripts/ios-device.sh --check
scripts/ios-device.sh
```

也可以每周在 Xcode 里连上手机再按一次 **⌘R**。覆盖安装保持同一个 bundle ID，歌单、
插件和登录态都会保留。免费账号还有同时安装 App 数量等限制，以 Apple 实际提示为准。

### 5. 付费开发者：1 年有效期

付费 Apple Developer Program 的开发描述文件有效期约 **1 年**。用同一个 Xcode 工程、
同一个 Team 重新 **⌘R** 安装即可；到期前再签一次。不需要 TestFlight，也不需要把 App
上架。证书/描述文件被吊销、换设备或换 bundle ID 时，需要重新签名。

## 方案 B：命令行脚本（Mac）

环境和依赖装好后，可以用仓库脚本自动找签名团队、构建 Release、安装并启动：

```bash
cd ~/code/MusicFree
git switch feat/ios-port
scripts/ios-device.sh --check   # 检查证书、团队和设备
scripts/ios-device.sh           # 构建 + 安装 + 启动
```

每周续签：

```bash
scripts/ios-refresh.sh
```

脚本默认启动 `fun.upup.musicfree`，并会轮换本 App 的旧 profile 强制 Xcode 向 Apple 换新；
构建失败会自动恢复旧 profile。如果你在 Xcode 里改了 bundle ID，启动时也要设成同一个值：

```bash
MUSICFREE_BUNDLE_ID=com.yourname.musicfree scripts/ios-device.sh
```

多套 Apple ID/团队时可以用 `--team <TEAMID>`，多台设备时用 `--device <UDID或名称>`。
Xcode 27 的设备菜单是 **Window → Manage Devices**，在里面可以打开 Wi-Fi 连接。

## 没有 Mac 怎么办

iOS 安装包必须经过 Apple 签名，Windows/Linux 不能直接运行 Xcode 编译本项目。可选：

1. 借一台 Mac，或用云 Mac，按方案 A 编译签名。
2. 让有 Mac 的人构建**未签名 IPA**，你再用自己的 Apple ID 通过 AltStore / SideStore /
   ESign 等工具签名安装。免费账号同样 7 天过期，需要定期重签。
3. 付费开发者可以用自己的证书做 Ad Hoc/Development 签名，有效期约 1 年。

本仓库不提供现成 IPA，也不建议安装来路不明的签名包。只从你信任的源码或构建产物签名。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| `No Account for Team` / `No profiles for ...` | Xcode → Settings → Accounts 登录 Apple ID；确认两个 target 都选了 Team |
| bundle identifier 不可用 | 两个 target 都改成唯一 ID，Widget 用 `你的ID.liveactivity` |
| `Untrusted Developer` | 设置 → 通用 → VPN 与设备管理 → 开发者 App → 信任 |
| `invalid code signature` | 两个 target 用同一 Team 重新安装；确认开发者模式已开；免费 profile 未过期 |
| 7 天后突然打不开 | 免费账号 profile 过期，重新 Build & Run 或跑 `ios-refresh.sh` |
| `pod install` 失败 | 确认 CocoaPods >= 1.16、Xcode 命令行工具已安装；必要时 `pod repo update` |
| Live Activity 不显示 | 需要 iOS 16.2+；App 内“基本设置 → 实时活动歌词”打开；系统设置里允许 MusicFree 实时活动 |
| 更换 bundle ID 后歌单/插件没了 | 换 ID 等于新 App；想保留数据请保持原 bundle ID 覆盖安装 |

完整使用说明（插件、本地音乐、下载、实时活动）见 [USAGE-zh.md](./USAGE-zh.md)。
