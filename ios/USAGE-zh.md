# MusicFree iOS 快速上手

## 1. 装插件

设置 → 插件管理 → 右下角 `+` → **从网络安装插件**，粘贴下面的地址。

推荐只装这几个：

| 插件 | 地址 | 说明 |
| --- | --- | --- |
| heb-main（订阅） | `https://raw.githubusercontent.com/hebijunge/musicfree-plugins/master/sub/githubio/main.json` | 一次装 6 个；QQ、酷狗、咪咕能播 |
| heb-music（订阅） | `https://raw.githubusercontent.com/hebijunge/musicfree-plugins/master/sub/githubio/music.json` | 一次装 11 个；实测只有 B站能播，嫌多可用下面的 B站单地址 |
| GD音乐台（单插件） | `https://cdn.jsdelivr.net/gh/qwerwhr/musicfree-plugins@main/GD%E9%9F%B3%E4%B9%90%E5%8F%B0.js` | 能播；歌词由 App 自动搜索兜底 |
| 网易云音乐（开源增强） | `https://raw.githubusercontent.com/qingniaoheyu/musicfree-netease-plugin-plus/main/plugin/musicfree-netease-plugin.js` | 能搜、能播、能导入歌单；iOS 上取流会自动升级到 https，不需要 Cookie |

如果不想一次装 11 个，B站用这个单插件地址：

`https://hebijunge.github.io/musicfree-plugins/plugins/bilibili-source.plugin.v1.1.4.js`

**注意：**

- 订阅/`.json` 地址会**一次安装 manifest 里的全部插件**，不是装一个。
- `qwerwhr` 的 76 个插件里混有 VIP/破解类，**不要整包订阅**；只单装上面的 GD音乐台即可。
- 安装失败先重试一次；超过 10 秒超时多半是网络抖动。
- 只有插件地址在本文档里，App 没有内置任何第三方订阅。

## 2. 哪些能播（一句话版）

- **能播**：QQ音乐、酷狗音乐、咪咕音乐、GD音乐台、B站、网易云音乐（开源增强）
- **只能搜、不能播**：官方 heb 网易云插件（取流是 http，被 iOS ATS 拦）、酷我、聚合、汽水（可留作歌词源）
- **别用**：Z 系列整源（接口是 http，被 iOS ATS 拦截）、qwerwhr 的酷我/酷狗、5sing、Apple Music、Jamendo（需自填 Client ID）

**网易云怎么播：** 官方 heb 网易云插件取流返回 `http://m701.music.126.net`，iOS 播放器会被 ATS 拦。App 已在播放器入口只把 `m*.music.126.net` 升级为 https（没有放开任意 HTTP），装上表里的「网易云音乐（开源增强）」即可正常播放。

**网易云歌单怎么导：** 设置 → 插件管理 → `网易云音乐（开源增强）` → **导入歌单**，粘贴歌单链接或 ID。公开歌单不需要 Cookie；私有歌单需要在插件「用户变量 → 网易云 Cookie」里填自己账号的 `MUSIC_U`（只填自己的，不要用他人 Cookie）。VIP/付费曲目不做绕过。

## 3. 本地音乐

1. 把音频文件（mp3 / m4a / flac / wav 等）拖进「文件」App → **我的 iPhone** → **MusicFree**。
2. App 首页 → **本地音乐** → 右上角菜单 → **扫描本地音乐**。
3. 在文件选择器里选中文件或文件夹，点「开始扫描」；支持直接选 Documents 根目录下的音频文件。

## 4. 下载位置

下载完成后，文件保存在：

**「文件」App → 我的 iPhone → MusicFree → `download/music`**

完成提示也会显示这个路径。下载目录可以在基本设置里改；改后会显示相对 Documents 的路径。

## 5. 实时活动歌词（锁屏 / 灵动岛）

设置 → **基本设置** → **实时活动歌词**，默认关闭。

打开后需要在系统「设置 → MusicFree → 实时活动」里允许实时活动；播放时锁屏和灵动岛会显示当前歌词。

## 6. 已知限制

- **DRM 源不能播**：猫耳FM 等 SAMPLE-AES/Widevine 源，AVPlayer 没有 FairPlay 解密能力。
- **http 接口被 ATS 拦**：只提供 `http://` 的插件（如 Z 系列、qwerwhr 酷狗）在 iOS 上不可用；官方 heb 网易云的播放地址也是 `http://m701.music.126.net`。开源增强插件的网易云取流同样返回 http，App 会在播放器入口把 `m*.music.126.net` 升级为 https（不改 ATS、不放开任意 HTTP）；GD 源备用插件则直接返回 https。
- **锁屏/灵动岛视觉待真机确认**：模拟器只能验证 ActivityKit 调用，最终排版、字号、刷新效果需要在 iPhone 上看。
- 官方 bilibili 插件的 `.m4s` 不能播；请用上面的 B站插件。

## 7. 装到真机（自签安装）

完整编译、签名、信任和续签说明见 **[INSTALL-zh.md](./INSTALL-zh.md)**。
简要版（Mac 已装好环境，手机已连接）：

```bash
cd ~/code/musicfree-ios
scripts/ios-device.sh --check   # 检查签名团队、证书和已连接 iPhone
scripts/ios-device.sh           # Release 构建 + 安装 + 启动
scripts/ios-refresh.sh          # 每周续签：自动换 profile + 覆盖安装 + 尝试打开
```

需要：Xcode 已登录 Apple ID、手机与 Mac 在同一 Wi-Fi（或插线）并在手机上点「信任」、打开「开发者模式」。
免费账号 profile 7 天过期，到期后重签；付费 Apple Developer Program 的开发描述文件约 1 年有效。
本项目不使用 TestFlight（TestFlight 同样需要付费开发者账号）。

`ios-refresh.sh` 成功时只输出一行结果，例如：

`续签成功 team=83Q9ZCWJQ4 device=sky_17pm 耗时 3m12s 新到期 Nov 22 20:48`

Xcode 默认不会主动延长仍然有效的 profile，所以脚本会先把本 App 的两个旧 profile 移到 `build/ios-profile-backup-*`，强制换新；构建失败会自动恢复。只想普通重装、不换 profile 时加 `--no-force-profile`。

失败时最后一行是原因，并以非 0 退出；完整日志在 `build/ios-device/`。覆盖安装使用同一个 bundle id，不会清空歌单、插件和登录态。续签以「构建 + 覆盖安装成功」为准：装完会尝试打开 App 一次，手机锁屏时只会在结果行末尾加「（手机锁着，没自动打开）」，退出码仍是 0，不影响每周任务。

Xcode 27 里旧的 **Devices and Simulators** 已改成 **Window → Manage Devices**。在里面选中 iPhone，勾选通过 Wi-Fi 连接，才能免数据线续签；只插线也能用。
