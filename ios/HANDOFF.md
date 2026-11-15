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

# 真机（自动读签名团队和设备，构建 Release 并安装 App + Widget Extension）
scripts/ios-device.sh --check     # 只做预检
scripts/ios-device.sh --launch    # 构建 + 安装 + 启动
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
    `ActivityContent` API，不保留旧版本降级分支。
12. `ios/MusicFreeNative/MFMp3Util.mm`：m4a/mp4 的 `setMediaTag` 用
    `AVAssetExportSession` 重写 metadata（title/artist/album/comment/lyric），
    先导出到同目录临时文件再原子替换原文件，失败不会破坏原文件；
    `getMediaTag` 同步补上 comment 读回；MP3 明确 reject 并返回可读错误。
13. `src/core/pluginManager/plugin.ts`：全局 `axios.defaults.timeout` 从 2s 调到 10s。
    2s 会让稍慢的插件接口（尤其境外 API）在搜索、插件安装时被误判为超时，实测
    udio 搜索耗时约 2.2s 时稳定报 `timeout of 2000ms exceeded`；改后正常。
14. 本地扫描：`src/pages/localMusic/mainPage/index.tsx` 的 `fileType` 从 `folder`
    改为 `file-and-folder`，并传入 `isLocalMediaFile` 过滤音频后缀；
    `src/core/localMusicSheet.ts` 的 `getMusicStats` 支持直接选中单个文件，
    不再把文件路径当目录 `readDir`。
15. 播放失败提示：`src/core/trackPlayer/index.ts` 在 `handlePlayFail` 中弹出 Toast，
    文案带歌名和简短原因（如「《晴天》播放失败：网络超时，已自动跳到下一首」）；
    离线时显示「当前无网络，无法播放《晴天》」。同一首歌 30s 内不重复提示，
    连续 PlaybackError 1s 内只处理一次，避免同一首歌触发多次自动切歌；普通失败全局 2s 节流。
16. 下载完成路径提示：`src/entry/bootstrap/bootstrap.ts` 在下载队列完成时，把实际下载目录
    拼进 Toast。iOS 显示「文件」App → 我的 iPhone → MusicFree → `download/music`
    （自定义目录则显示相对 Documents 的路径）；Android 显示实际目录。Toast 时长 4s。
17. 搜索页插件 tab 刷新：`src/pages/searchPage/components/resultPanel/resultSubPanel.tsx`
    通过 `usePlugins()` 订阅插件列表，routes / renderScene 依赖插件列表变化；
    卸载当前 tab 对应插件时把 index 收回到最后一个可用 tab。搜索页打开期间安装插件后，
    tab 无需退出重进即可出现。
18. 冷启动歌词：复测 `setupTrackPlayer()` 恢复 `music.musicItem` → `setCurrentMusic()`
    → `lyricManager.setup()` 末尾 `refreshLyric(true)` 的链路，冷启动后 QQ 歌曲自动加载
    63 行歌词，无需额外改动；保留该调用作为回归点。
19. 启动图深色适配：`LaunchScreen.storyboard` / `SplashScreen.storyboard` 背景改为
    asset catalog 的 `LaunchBackground`（Light `#FFFFFF`，Dark `#1E1E1E`）；
    中间 `MusicFree` 文案使用 `labelColor`，底部文案使用 `secondaryLabelColor`；
    布局约束未改。模拟器系统深色/浅色各截图验证，深色下不再白闪。
20. 网易云换源：改用 AGPL-3.0 开源增强插件 `qingniaoheyu/musicfree-netease-plugin-plus`
    0.7.0（207,185 字节，SHA256 `b4d8c783...`），不再依赖 hebijunge 的混淆 dist 包；
    后续在 23/24 升级为 `ios/plugins/netease-plus.plugin.js` 0.7.1 适配版。
    无 Cookie 实测搜索 30 条、公开歌单「朗朗晴天」导入 15 首；`all` 在未登录时按预期报错。
21. `scripts/apply-react-native-patches.js` + `package.json` 的 `postinstall`：iOS 显式
    `Cookie` 请求头不再和 `NSHTTPCookieStorage` 合并。修复前 httpbin 实测原生
    `MUSIC_U` 会排在插件手写值前面；修复后只发插件值，普通请求仍带原生 Cookie。
    只改 `node_modules/react-native/Libraries/Network/RCTNetworking.mm`，脚本幂等，
    RN 升级导致代码块变化时会报错提醒。不是照搬 Android CookieFix，不改 ATS/Info.plist。
22. `src/core/trackPlayer/index.ts`：进入播放器前把 `http://m*.music.126.net/...`
    升级为 https（只限这个网易云 CDN），修复 plus 插件返回 http 地址导致
    `ios_failed_to_load_resource`；其他 http 源不动。实测同一首歌修复前 error、
    修复后 `playing` 16.9s / 21.54s。
23. 网易云扫码登录（eapi）验证：`导入单曲 → 输入 login` 生成 quickchart 二维码；
    `/eapi/register/anonimous`、`/eapi/login/qrcode/unikey` 均 200，轮询
    `/eapi/login/qrcode/client/login` 稳定返回 801「等待扫码」，没有 `-462`。
    用假 `Set-Cookie` + 803 验证成功分支：插件进入「扫码成功」并把凭证写入用户变量。
    真实 802/803 需要用户用自己的网易云 App 扫码，本次未测。
24. 扫码凭证持久化：上游 0.7.0 的 `qrLoginCookie` 只在模块内存，JS 重载后丢失。
    `src/core/pluginManager/plugin.ts` 的插件环境新增 `env.setUserVariables`，
    `ios/plugins/netease-plus.plugin.js`（0.7.1 适配版）在 803 成功后自动把
    整份 Cookie 合并写回用户变量；实测重载后用户变量仍在、扫码会话状态已清空。
    旧客户端没有 setter 时自动退化为内存模式，并在说明页提示「重启后需重扫」。
    凭证只写本机存储，不写仓库/日志。
25. 网易云 GD 源升到 1.1.2：`trackIds` 按 **199** 一批补 `/api/song/detail`，
    留出服务端约 201 首上限的余量；公开 999 首歌单 `4987986874` 完整导入
    999/999（1.66s），10k 歌单 `12708387047` 跑满 54 批，但 NetEase 在约 50 批后
    开始返回 405 限流，10k 只验证了分批路径，不冒充全量成功。
    1.1.1 已验证的 200/728 首、首曲 `playing` 9.77s/295.94s 仍有效。
    私有歌单只做代码级验证：公开 `specialType=5` 歌单 120 首可读；私有需自己的
    `MUSIC_U`，hint 改为失败时补完整 Cookie（含 `__csrf`），没有真实账号不伪造成功。
26. 真机续签收口：`scripts/ios-device.sh` 的 `find_team()` 不再从证书 CN 括号里取
    10 位值（`7C4Q7824B6` 是证书 ID），改为解析证书 subject 的 `OU=83Q9ZCWJQ4`；
    失败时回退到最新 `.mobileprovision` 的 `TeamIdentifier`。新增
    `scripts/ios-refresh.sh`：预检团队/物理设备，优先网络连接，构建 + 覆盖安装
    （`--no-launch`）后单独尝试启动；安装成功即算续签成功，锁屏只在结果行末尾
    加「（手机锁着，没自动打开）」，退出码仍为 0。成功只输出一行，失败输出一行
    原因；日志留在 `build/ios-device/`。
    默认会先轮换本 App 的旧 profile（备份到 `build/ios-profile-backup-*`，失败恢复），
    保证 `-allowProvisioningUpdates` 真的向 Apple 换新。
    Xcode 27 的设备菜单是 **Window → Manage Devices**，不是旧的
    “Devices and Simulators”。

## 每周续签

```bash
cd ~/code/musicfree-ios
scripts/ios-refresh.sh
```

成功输出示例：

```text
续签成功 team=83Q9ZCWJQ4 device=sky_17pm 耗时 3m12s 新到期 Nov 29 20:48
```

- 免费账号 profile 7 天过期；建议每周固定跑一次，手机保持同一 Wi-Fi 并解锁。
- Xcode 不会因为 `-allowProvisioningUpdates` 就主动延长仍然有效的 profile。
  `ios-refresh.sh` 默认先把本 App 的两个旧 profile 移到
  `build/ios-profile-backup-*`，强制 Xcode 向 Apple 换新；构建失败会自动
  恢复旧 profile。`--no-force-profile` 可关闭这一步（只做普通重装）。
- 覆盖安装使用同一个 bundle id `fun.upup.musicfree`，保留 Documents 下的歌单、
  插件和登录态；不会先卸载。本次实测 `Documents/plugins` 仍是 5 个，
  `LocalSheet.*` 文件时间仍是安装前的 19:44/19:45。
- 真机 `plugin-meta` 当前没有任何 `*.userVariables`，说明这台机器没有可验证的
  持久化网易云登录 Cookie；不是覆盖安装清掉的，需要用户在 App 内重新扫码/填 Cookie。
- 失败最后一行是原因，非 0 退出；完整日志在 `build/ios-device/refresh-*.log`。
- 续签以「构建 + 覆盖安装成功」为准，装完再单独尝试打开 App 一次。手机
  锁屏时系统会拒绝启动，这时只在一行结果末尾加「（手机锁着，没自动打开）」，
  退出码仍是 0，不会把一次成功的续签误报成失败。App 没装上、签名不匹配等
  真正影响使用的启动错误仍然算失败。

### 每周定时（可选，Mac 端）

用 launchd 每周五 10:00 自动跑一次（需要 Mac 醒着、手机同一 Wi-Fi）：

```bash
cat > ~/Library/LaunchAgents/fun.upup.musicfree.refresh.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>fun.upup.musicfree.refresh</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/sky/code/musicfree-ios/scripts/ios-refresh.sh</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/sky/code/musicfree-ios</string>
  <key>StartCalendarInterval</key>
  <dict><key>Weekday</key><integer>5</integer><key>Hour</key><integer>10</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>/Users/sky/code/musicfree-ios/build/ios-device/refresh.out.log</string>
  <key>StandardErrorPath</key><string>/Users/sky/code/musicfree-ios/build/ios-device/refresh.err.log</string>
</dict>
</plist>
PLIST
launchctl unload ~/Library/LaunchAgents/fun.upup.musicfree.refresh.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/fun.upup.musicfree.refresh.plist
```

脚本成功只写一行到 `refresh.out.log`（`续签成功 team=... device=... 耗时 ... 新到期 ...`），
失败写 `续签失败: ...` 并以非 0 退出。本次只写文档，没有在这台 Mac 上安装这个定时任务。

### 2026-11-15 实测

- `scripts/ios-device.sh --check`：`签名团队: 83Q9ZCWJQ4`，`目标设备: sky_17pm`。
- 临时 bundle id `fun.upup.musicfree.refreshtest.*` 构建成功，Apple 新发了
  app + widget 两个 profile（TeamIdentifier `83Q9ZCWJQ4`，到期 11-22）；
  验证后临时 profile 和 `build/ios-refresh-test` 已删除，未改真实 bundle 配置。
- 真实 `scripts/ios-refresh.sh`（`--no-launch` + 单独尝试启动）连续跑了两次：
  第一次 47s，最终脚本 **41s**（20:58→20:59），都是 `BUILD SUCCEEDED`、
  `App installed`；手机锁屏，启动被系统拒绝，结果行末尾加
  「（手机锁着，没自动打开）」，**退出码 0**。
  输出：`续签成功 team=83Q9ZCWJQ4 device=sky_17pm 耗时 0m41s 新到期 Nov 22 20:59（手机锁着，没自动打开）`。
- 新 profile（最后一次轮换后）：app 到期 `2026-11-22T12:59:10Z`，widget 到期
  `2026-11-22T12:59:03Z`（本地 `Nov 22 20:59`）；`build/ios-profile-backup-*`
  已清理。
- 覆盖安装后数据：`Documents/plugins` 仍是 5 个文件（bilibili/gd/kugou/
  netease-gd/qq），`LocalSheet.*` mtime 仍是 19:44/19:45，`plugin-meta` 安装前后
  SHA256 都是 `bbe826a1...`。`plugin-meta` 里没有 `userVariables`，这台机器
  本来就没有持久化的网易云登录态，不是覆盖安装清掉的。
- 本地歌单上限：模拟器新建歌单写入 1001 首，`musicList.length=1001`、
  `worksNum=1001`，删除成功；确认「我的歌单」没有 1000 首上限。导入面板的
  `maxLength: 1000` 只是输入框文本长度，不是歌曲数量。

## 当前卡点（不是代码问题）

- **签名**：已登录 Apple ID，`security find-identity -v -p codesigning` 有 1 个有效
  `Apple Development: 739686898@qq.com (7C4Q7824B6)`。CN 括号里的是证书 ID；
  真实团队 ID 是证书 subject 的 `OU=83Q9ZCWJQ4`。
- **真机连接**：`sky_17pm`（devicectl ID `17A47821-4A2D-5FD0-8D5A-9288B86EB8F9`，
  硬件 UDID `00008150-001264103A03401C`）已连接；`scripts/ios-device.sh --check`
  能解析出团队和设备。无线续签需在 Xcode 的 **Window → Manage Devices** 里开启
  Wi-Fi 连接。
- **模拟器**：iOS 27.2 有两个 runtime：按机型的 24B91014 只支持 iPhone Duo；
  通用版 24B8117 支持 iPhone 15–18 全系。当前验证机为 iPhone 17 Pro Max
  （UDID `9959CA3C-AA80-4485-BED0-4E680F998704`），启动和主要功能已验证，见下方进展。
  截图用 `xcrun simctl io <UDID> screenshot <file>`，17 Pro Max 不需要 `--display`；
  iPhone Duo 上 App 画面在 `--display=1`（不是 3）。iPhone Duo 已关机，不要启动。

## 真机调试步骤

### 用户需要做的（一次性准备）

1. **Xcode 登录 Apple ID**：已完成（当前有 `Apple Development: 739686898@qq.com`），
   可跳过；换账号时在 Xcode → Settings → Accounts 重新登录，免费账号即可。
2. **连接 iPhone**：用数据线连接 Mac，手机上点「信任」并输入锁屏密码。
3. **打开开发者模式**：iPhone → 设置 → 隐私与安全性 → 开发者模式 → 打开，
   按提示重启手机并确认。
4. 回到 Mac 验证：
   ```bash
   security find-identity -v -p codesigning   # 应有一条 Apple Development: ... (证书ID)
   xcrun devicectl list devices               # 应出现 connected 的真机
   ```
   注意：证书 CN 括号里的值（如 `7C4Q7824B6`）是证书 ID，不是 Team ID；
   Team ID 在证书 subject 的 `OU=` 字段（当前为 `83Q9ZCWJQ4`）。

### Xcode 27 的无线连接

Xcode 27 已经移除了旧的 **Devices and Simulators** 窗口。现在用菜单
**Window → Manage Devices**（IDEKit 里的 `Xcode.IDEKit.CmdDefinition.ManageDevices`），
选中 iPhone 后勾选通过 Wi-Fi 连接。开启后 `devicectl` 会显示
`transportType=localNetwork`，`ios-device.sh` / `ios-refresh.sh` 会优先选这条连接；
没有 Wi-Fi 时插线也能续签。

### 跑脚本

```bash
cd ~/code/musicfree-ios
scripts/ios-device.sh --check      # 预检签名团队、证书和物理设备
scripts/ios-device.sh --list       # 查看签名身份和设备
scripts/ios-device.sh              # Release 构建 + 安装 + 启动
scripts/ios-refresh.sh             # 每周续签（构建 + 覆盖安装 + 尝试打开）
```

常用参数：

| 参数 | 作用 |
| --- | --- |
| `--device <UDID或名称>` | 多台设备时指定目标；名称不唯一会要求改用 UDID |
| `--team <TEAMID>` | 跳过钥匙串解析，手动指定团队 |
| `--configuration <Debug/Release>` | 默认 Release |
| `--build-only` / `--install-only` | 只构建 / 只安装（复用 `build/ios-device` 产物） |
| `--no-launch` | 安装后不启动（默认安装完会启动 `fun.upup.musicfree`） |
| `--check` / `--list` | 只做预检 / 只列身份和设备 |

环境变量覆盖（命令行参数优先）：

| 变量 | 作用 |
| --- | --- |
| `MUSICFREE_TEAM_ID`（或 `DEVELOPMENT_TEAM`） | 签名团队，跳过钥匙串解析 |
| `MUSICFREE_DEVICE` | 设备 UDID 或名称，等同 `--device` |
| `MUSICFREE_CONFIGURATION` | `Debug` / `Release` |
| `MUSICFREE_BUNDLE_ID` | `--launch` 使用的 bundle id |

脚本行为：

- 签名团队优先取证书 subject 的 `OU=`（不是 CN 括号里的证书 ID），取不到时
  回退到最新 `.mobileprovision` 的 `TeamIdentifier`；`--team` / `MUSICFREE_TEAM_ID`
  仍可显式覆盖。找不到证书时提示登录 Apple ID / 生成证书；
- 用 `xcrun devicectl list devices --json-output` 找设备，并按
  `properties.hardware.reality == "simulated"` 过滤掉模拟器
  （devicectl 会把模拟器也标成 connected，不能直接信）；优先选
  `transportType != wired` 的网络连接，插线也能用；检测到物理设备但未连接时
  会列出设备并提示「同一 Wi-Fi / 解锁 / 信任」；
- `xcodebuild -workspace ios/MusicFree.xcworkspace -scheme MusicFreeNew
  -configuration Release -destination 'generic/platform=iOS'
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration
  DEVELOPMENT_TEAM=<TEAMID> CODE_SIGN_STYLE=Automatic`；
  App 与 `MusicFreeLiveActivity` Widget Extension 两个 target 都由同一个团队自动签名、
  自动注册 App ID 和描述文件，不需要手工建 Provisioning Profile；
- 免费账号第一次构建时，generic 目标可能还没有可用的开发描述文件；脚本检测到
  `No profiles for` / provisioning 错误后，会自动改用已连接设备的
  `-destination 'id=<UDID>'` 重试，让 Xcode 注册设备并生成描述文件；
- 构建后检查 `MusicFree.app/PlugIns/MusicFreeLiveActivity.appex` 存在，
  并对 App 和 appex 执行 `codesign --verify --deep --strict`；
- 用 `xcrun devicectl device install app --device <UDID>` 安装，然后默认用
  `xcrun devicectl device process launch --device <UDID> fun.upup.musicfree` 启动
  （`--no-launch` 可跳过）；
- 构建/安装失败时按日志打印分类提示：没登录 Apple ID / 没有开发证书、
  Bundle ID 冲突、开发者模式未开、设备未连接；完整日志在
  `build/ios-device/build.log` 和 `build/ios-device/install.log`。

免费账号注意事项：

- 证书/描述文件 7 天过期，过期后重跑脚本即可；
- 首次安装后若打不开，去 iPhone → 设置 → 通用 → VPN与设备管理 →
  信任开发者证书；
- Widget Extension 需要单独的 App ID，脚本的 `-allowProvisioningUpdates`
  会自动创建；若自动签名仍失败，用 Xcode 打开 `ios/MusicFree.xcworkspace`，
  在 App 和 MusicFreeLiveActivity 两个 target 的 Signing & Capabilities
  里选择同一个 Team，再重跑脚本；
- 免费账号最多同时注册 3 台设备、10 个 App ID，够本机调试用。

装好后按下一节「回归清单」在真机上逐项复核，重点补上模拟器无法覆盖的
后台播放、锁屏控制、耳机线控、来电打断和实时活动视觉效果。

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
- 实时活动歌词已完成并在 iPhone 17 Pro Max 验证（2026-11-15，当时最低 iOS 16.2）：播放 0.3s/行的
  测试 `.lrc`，`[MFLiveActivity] update` 日志显示实际更新间隔约 1.00s，content state 同时携带
  上一句/下一句/进度/播放状态；暂停/继续时日志分别为 `playing=false` / `playing=true`；
  关闭开关触发 `end count=1 reason=disabled` 和 ActivityKit `Ending activity`；
  强杀 App 后重启，日志为 `cleanup class=MFLiveActivity` + `end count=1 reason=orphan-cleanup`，
  旧活动消失且不会自动新建；chronod 日志显示 Widget Extension reload 成功
  （activity archive 约 53KB）。改为 16.2 API 后在最终 Debug 构建上复测：
  `start title=MF标签标题`、三行歌词 update、`playing=true/false` 均正常。
  回归时复测了「实时活动歌词」开关：关闭后配置为 false 且原生 end 无报错，
  重新打开后配置为 true、`LyricUtil.showStatusBarLyric` resolve 正常。
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
- 真机构建：Debug / Release 的 `iphoneos` 无签名编译均通过；Release 产物内嵌
  `MusicFreeLiveActivity.appex`（arm64，MinimumOSVersion 16.2）。最低版本最终定为
  16.2 后重新构建，App 与 appex 的 `MinimumOSVersion` 均为 16.2；ActivityKit 在 App 与
  扩展二进制中都是 `LC_LOAD_DYLIB`（强链接，不是弱链接）。**最低版本固定为 16.2，
  不再改动**，理由：只保留运行验证过的路径——本机只有 iOS 27.2 runtime，16.1 分支只编译过、
  没运行过；能升到 16.x 的机器基本都能到 16.7，16.1 与 16.2 的实际覆盖几乎无差别。
  Pods 保持 15.1，且没有 Pod 链接 ActivityKit。真机签名构建由 `scripts/ios-device.sh` 执行。
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
  不会重复处理）。修复后重新用 GD 音乐台搜索《稻香》并在线播放，https 流媒体
  `playing`、进度正常，在线链路未受影响。
- 断网/弱网：NetInfo 读取到 `Wifi`；搜索请求失败时结果页显示「出错啦…/点击重试」。
  播放失败现在会立即弹出 Toast：「播放失败，已自动跳到下一首」或
  「播放失败，已暂停」（取决于「播放失败时自动暂停」）；断网时 60s 内只提示一次
  「网络不可用，请检查网络连接」，避免每首歌都弹。自动跳歌仍是 500ms 后执行。
- 本地音乐：扫描选择器已改为 `file-and-folder` + 音频后缀过滤，`Documents`
  根目录的音频文件会直接列出并可多选；`importLocal` 也能处理单个文件路径
  （不会把文件当目录 `readDir`）。仍可递归导入文件夹。
- 下载完成只有 Toast「下载任务已完成」，没有「在 Files 中查看」引导；文件实际在
  `Documents/download/music`，Files App 的「我的 iPhone → MusicFree」可见。
  最小改动：在完成 Toast 或下载列表页补一句路径说明；iOS 不能深链到具体文件夹。
- 启动图：冷启动为白色 MusicFree 启动图约 0.6s，随后进入深色首页；无黑屏、
  无空白白屏。深色主题下白色启动图到深色首页的过渡较明显，若要统一可改
  `SplashScreen.storyboard` 背景色（等图标/素材一起处理）。
- 注意：ATS 仍禁止明文 HTTP（`NSAllowsArbitraryLoads` 为 false），只开了
  `NSAllowsLocalNetworking`（Metro/本机测试）与 `NSAllowsArbitraryLoadsForMedia`；
  远程 http 插件 API 仍会失败，遇到只记录、不私自放开，是否允许需用户确认。

## 核心链路结论（2026-11-15，iPhone 17 Pro Max 模拟器）

完整链路：装插件 → 搜索 → 在线播放 → 歌词 → 音质切换 → 上一首/下一首 →
加入歌单 → 播放历史。可用插件选用 **Audiomack**（上一轮的 GD 音乐台同样可用），
失败项按「插件接口 / ATS / App 逻辑」分类：

| 环节 | 结果 | 分类 |
| --- | --- | --- |
| Audiomack 搜索 | 通过，20 条 | — |
| Audiomack 在线播放 | 通过，`playing`，进度 7.24s → 17.08s / 269.8s（最终 16.2 构建） | — |
| Audiomack 歌词 | 插件没有 `getLyric`；App 自动搜索歌词命中「歌词网」，22 行，27.65s 行正确 | 插件能力缺失；App 的 fallback 正常 |
| Audiomack 音质切换 | `changeQuality("high")` 返回 false；插件只接受 `standard`（其他档位返回 null） | 插件接口能力 |
| bilibili 搜索 | 通过，20 条 | — |
| bilibili 播放 | 返回 `.m4s`，TrackPlayer 报 `ios_track_unplayable`，状态 `error` | 插件输出与 AVPlayer 不兼容（AVPlayer 不认纯 m4s）；不是 ATS |
| 猫耳FM 搜索 | 通过，30 条 | — |
| 猫耳FM 播放 | HLS 源，状态停在 `buffering`、进度 0、时长 185s；源为 SAMPLE-AES/Widevine DRM | 插件/DRM：AVPlayer 无 FairPlay 解密能力；不是 ATS |
| GD 音乐台 | 上一轮搜索/播放/歌词/上下首全通过；二次 `changeQuality("high")` 遇 503 | 插件服务端限流；重试即可，不是 App |
| 上一首/下一首 | 通过：曲目 id 10921920 → 18955314 → 10921920 | — |
| 加入歌单 | 通过：新建「16.2回归测试」歌单加入 1 首，随后删除歌单成功 | — |
| 播放历史 | 通过：历史 29 条，前两条为本轮播放的 Audiomack 曲目 | — |
| ATS | 未改动；本轮所有请求走 https，失败项均与 ATS 无关 | — |
| App 逻辑 | RNTP `playback-error` payload 修复后自动跳下一首正常，未发现其他阻塞 | — |

结论：iOS 侧「搜索 → 在线播放 → 歌词 → 上下首 → 歌单 → 历史」主链路已通，
播放可用性主要受插件输出格式和 DRM 限制，App 侧不需要为此改 ATS。

## 已知限制（插件生态）

App 侧播放链路已经跑通；下面这些失败是插件输出或版权保护导致的，**不要**再当成
App bug 逐个排查，也不要为了它们放开 ATS：

| 限制 | 影响 | 处理 |
| --- | --- | --- |
| 官方 bilibili 插件返回 `.m4s` | AVPlayer 无法识别，报 `ios_track_unplayable`；heb-music 的「B站」插件实测可播 | 官方插件输出格式问题；需要插件改回 mp4/m4a，App 不做格式转换 |
| 猫耳FM HLS 为 SAMPLE-AES/Widevine DRM | AVPlayer 无 FairPlay 解密能力，播放停在 buffering | DRM 限制，iOS 无法播放 |
| Audiomack 仅支持 `standard` 音质 | 切 high 等档位返回 false | 插件接口能力，保持 standard 即可 |
| 官方插件 403 / 503 / 要求登录 / TLS 不可达 | 搜索或取流失败 | 插件服务端/网络问题，换可用插件，不要改 App |
| 只提供 http 的插件 API | ATS 拦截（https-only） | 只记录；是否放开需用户确认，默认不动 ATS |
| 官方 heb 网易云取流返回 `http://m701.music.126.net` | 播放 `error`、position 0；插件内 2s Range 探测报 `Network Error` | 不是登录/VIP/版权问题。已改用 qingniaoheyu 开源增强插件，并在 `src/core/trackPlayer/index.ts` 把 `m*.music.126.net` 升级为 https；不改 ATS |
| heb 网易云歌单导入返回 0 首 | 底层返回歌单对象（`musicList` 嵌套），App 期望数组；`getMusicSheetInfo` 对纯 ID 报无详情源 | 用「网易云音乐（开源增强）」或备用 GD 源的导入，不修 App 的插件适配层 |
| qwerwhr 网易云取流 API 429 | 搜索/导入正常、播放 `error` | 上游 Cloudflare Workers 每日额度用尽；换「网易云音乐（开源增强）」或备用 GD 源 |
| 网易云 GD 源私有歌单 | 未账号实测 | 无真实 Cookie；公开 `specialType=5` 歌单已验证可读。私有歌单需自己账号 `MUSIC_U`，失败时改填完整 Cookie（含 `__csrf`） |
| 网易云扫码真实 802/803 | 未实测 | 需要用户用自己的网易云 App 扫一次并确认；801 轮询和假 803 成功分支已验证。上游 0.7.0 扫码凭证只存内存，重启后需重扫；本仓库 0.7.1 适配版会自动写回用户变量 |

选插件时的优先级：**QQ音乐、酷狗音乐、咪咕音乐、GD音乐台、B站、网易云音乐（本仓库 0.7.1 适配版）**已验证可播；
网易云音乐（GD 源）作为备用。详见 `ios/PLUGIN-SOURCES.md` 的四源 21 插件实测和网易云专项。官方示例插件（bilibili、猫耳、
快手、YouTube、音悦台、suno 等）当前基本不可用，除非插件本身更新，否则不再重复尝试。
插件请求超时已从 2s 调到 10s（`src/core/pluginManager/plugin.ts`），慢接口不会再被
误判为超时。完整的源/插件失效清单和可复制安装地址见 `ios/PLUGIN-SOURCES.md`。

## 回归清单（2026-11-15，iPhone 17 Pro Max 模拟器；真机连接后需复测标「待真机」的项）

| 项目 | 结果 | 证据 / 备注 |
| --- | --- | --- |
| 冷启动 | 通过 | `simctl terminate` + `launch`，7s 内进入首页；深色主题、歌单保留；无 JS 错误 |
| 启动图 | 通过 | 系统深色 `#1E1E1E` + 白字，系统浅色白底 + 黑字；布局约束未改 |
| 搜索 | 通过 | 搜索页搜索「晴天」；默认「快手」tab 为 0 条，切到「猫耳FM」tab 显示 10 条（默认 tab 无结果是插件数据问题） |
| 在线播放 | 通过 | Audiomack `playing`，进度从 7.24s 推进到 17.08s / 269.8s（最终 16.2 构建） |
| 下载 | 通过 | 7,634,986 bytes，状态 1→2→3，队列完成；文件落 `Documents/download/music`；完成 Toast 带「文件」App 路径 |
| 插件源实测 | 通过 | 4 个订阅源、21 个代表插件、统一搜「晴天」并试播；结果与最小安装集见 `ios/PLUGIN-SOURCES.md` |
| 网易云专项 | 通过 | 官方 heb 插件返回 http CDN（ATS 拦）；qwerwhr 取流 429；`ios/plugins/netease-gd.plugin.js` 搜索 20 条、`playing` 0→22.3s/270.74s、歌词 65 行、封面 https |
| 网易云歌单导入 | 通过 | 公开歌单「朗朗晴天」ID `2678496359`：15 首导入，写入本地歌单 15 首，首曲最终 `playing` 0→5.36s/21.54s（固定 URL 重装后首播 1 次瞬时 error 后恢复）；15/15 取流成功。大歌单「热歌榜」`3778678` 导入 200 首，126 首标 VIP；heb 导入返回 0（返回结构不兼容）、qwerwhr 可导入但取流 429 |
| 网易云 GD 源 1.1.2 公开歌单 | 通过（10k 限流除外） | 1.1.1：`getMusicSheetInfo("3778678")` → 「热歌榜」200 首、`isEnd=true`；首曲 `playing` 9.77s/295.94s；`5077188964` 728 首导入成功。1.1.2：`4987986874` 999/999 全量导入（1.66s，去重 999）；`12708387047` 10k 跑 54 批，NetEase 约 50 批后 405 限流，只导入 9960/10644 |
| 网易云 GD 源私有歌单 | 代码级结论 | 无真实账号 Cookie，未伪造。公开 `specialType=5`「喜欢的音乐」`433804666` 无 Cookie 读取 120 首；假 `MUSIC_U` 和 `MUSIC_U+__csrf` 两种写法都能发出，公开歌单均返回 120 首。私有 `privacy=10` 未实测；`api/v6/playlist/detail` 是 GET，通常只需 `MUSIC_U`，hint 已改为失败时补完整 Cookie（含 `__csrf`） |
| 网易云开源增强插件（无 Cookie） | 通过 | `qingniaoheyu` 0.7.0（hash `b4d8c783...`）：搜索「晴天」`/weapi/cloudsearch/pc` 200、30 条，未出现 `-462`；公开歌单「朗朗晴天」导入 15 首，`getMusicSheetInfo` 15 首、`isEnd=true`；`all` 未登录报「未登录，读不到你的歌单」，符合预期 |
| iOS 显式 Cookie 透传 | 通过 | 修复前 httpbin 收到 `MUSIC_U=NATIVE; ...,MUSIC_U=HEADER; __csrf=...`（原生在前）；`RCTNetworking` 补丁后只收到手写值。正常请求仍带原生 Cookie；插件假 Cookie 测试中 `/weapi/cloudsearch/pc` 含假值、不含原生标记；`Set-Cookie` 响应头仍可读 |
| 网易云 http→https | 通过 | plus 插件 `getMediaSource` 返回 `http://m10.music.126.net/...`，直接播放报 `ios_failed_to_load_resource`；同一 URL https 版 `playing` 8.76s/21.54s；App `normalizeMediaUrl` 生效后导入 15 首、首曲 `playing` 16.9s/21.54s |
| 网易云扫码登录 | 通过（801）/ 逻辑验证（803） | `login` 生成二维码，quickchart 图片 200/400×400；eapi 匿名注册/unikey 200；轮询稳定 801「等待扫码」，无 `-462`。假 `Set-Cookie` + 803 时插件显示「扫码成功」并写入用户变量。真实 802/803 待用户扫码 |
| 扫码凭证持久化 | 通过 | 0.7.1 适配版扫码 803 后 `getUserVariables()` 出现假凭证；JS 重载后用户变量仍在、二维码/轮询状态消失；旧版 0.7.0 重载后两者都丢。测试用假值，已清空 |
| 本地导入 | 通过 | `Documents` 根目录的选择器会列出音频文件并隐藏 `.lrc`；直接选中单个 `test-tone.m4a` 导入成功（1 首，标题读为「MF标签标题」）；文件夹递归导入此前已验证 4 首 |
| 播放失败提示 | 通过 | 在线弹「《晴天》播放失败：网络超时，已暂停」；重复触发同一首歌时 `lastPlayFailToastAt` 不变（30s 节流生效）；离线弹「当前无网络，无法播放《晴天》」 |
| 冷启动歌词 | 通过 | QQ 歌曲播放后暂停 → 杀进程 → 冷启动，自动恢复当前歌曲并加载 63 行歌词；“启动自动播放”开/关两种配置都复测通过，无需进入播放页 |
| 搜索页插件 tab | 代码验证 | `ResultSubPanel` 已订阅 `usePlugins()` 并补 routes/renderScene 依赖；headless 无法点按搜索页，待真机复核 |
| 断网提示 | 通过 | 模拟离线后播放失败，弹「当前无网络，无法播放《晴天》」；60s 内只提示一次 |
| 主题切换 | 通过 | 设置 → 主题设置，点「浅色模式」→ `p-light`，点「深色模式」→ `p-dark`，配置持久化 |
| 插件增删 | 通过 | 卸载 TestPlugin：9→8 且插件管理页消失；从本地文件重新安装：8→9，插件管理页重新出现。headless 环境无法点按，调用的是页面按钮背后的同一个 `pluginManager` 方法 |
| Live Activity 开关 | 通过 | 基本设置 → 实时活动歌词：关 → `lyric.showStatusBarLyric=false`，开 → `true`；原生 end/show 调用无报错 |
| 歌词 | 通过 | Audiomack 无歌词源，自动搜索「歌词网」返回 22 行，当前行随进度更新 |
| 上一首/下一首 | 通过 | 曲目 id 10921920 → 18955314 → 10921920 |
| 加入歌单 | 通过 | 临时歌单「16.2回归测试」+1 首，删除歌单成功 |
| 播放历史 | 通过 | 29 条，前两条为本轮播放的 Audiomack 曲目 |

版本说明：核心链路和回归清单在 iPhone 17 Pro Max 模拟器上完成；最终 16.2 构建
重新编译通过，App 与 appex 的 `MinimumOSVersion` 均为 16.2，冷启动已复测。

真机待复核（模拟器无法覆盖）：后台播放、锁屏控制、耳机线控、来电打断、
Live Activity 锁屏/灵动岛视觉与播放按钮点按、Files 文件选择器、分享/导出。

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
9. 品质打磨：图标重绘（已完成）、启动图深色适配（已完成，Light `#FFFFFF` / Dark `#1E1E1E`）、
   ATS 保持 https-only（`NSAllowsArbitraryLoads` 未开启）

## 最终检查（2026-11-15）

| 检查 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | 通过（无输出，exit 0） |
| `npm run lint` | 通过（0 errors；108 warnings，均为既有 inline-style / hook deps 告警） |
| Debug `iphoneos` 无签名编译 | `BUILD SUCCEEDED`；产物 `MinimumOSVersion` 16.2 |
| Release `iphoneos` 无签名编译 | `BUILD SUCCEEDED`；App 与 `MusicFreeLiveActivity.appex` 均 16.2 |
| 模拟器启动图 | 系统深色：`#1E1E1E` + 白字；系统浅色：白底 + 黑字；布局未变 |
| 最低版本 | 全工程 16.2，HANDOFF 与代码一致 |

真机仍待连接；连接后先跑 `scripts/ios-device.sh --check`，再跑 `scripts/ios-device.sh`。

## 协作约定

- 仓库文件归接手的 bot 所有；交接方不再改这个目录，避免冲突
- 不要在别人的 `~/.codync` 目录下写文件；所有产物放 `~/code/musicfree-ios`
- `pod install` 会改 `project.pbxproj` 和 `PrivacyInfo.xcprivacy`，属正常，提交即可
- `ios/MusicFree.xcworkspace/` 已加入 `.gitignore`（由 pod install 生成）
- 上游 `.gitignore` 忽略了 `scripts/`，但已加例外 `!scripts/`、`!scripts/ios-device.sh`；
  `scripts/ios-device.sh` 是正常 `git add` 纳入版本管理的，改脚本后直接 add 即可，不再需要 `-f`
- 每次提交前 `npm run lint` 会自动跑（lint-staged），提交信息用上面的 type
