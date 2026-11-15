# MusicFree iOS 快速上手

## 1. 装插件

设置 → 插件管理 → 右下角 `+` → **从网络安装插件**，粘贴下面的地址。

推荐只装这 4 个：

| 插件 | 地址 | 说明 |
| --- | --- | --- |
| heb-main（订阅） | `https://raw.githubusercontent.com/hebijunge/musicfree-plugins/master/sub/githubio/main.json` | 一次装 6 个；QQ、酷狗、咪咕能播 |
| heb-music（订阅） | `https://raw.githubusercontent.com/hebijunge/musicfree-plugins/master/sub/githubio/music.json` | 一次装 11 个；实测只有 B站能播，嫌多可用下面的 B站单地址 |
| GD音乐台（单插件） | `https://cdn.jsdelivr.net/gh/qwerwhr/musicfree-plugins@main/GD%E9%9F%B3%E4%B9%90%E5%8F%B0.js` | 能播；歌词由 App 自动搜索兜底 |
| 网易云音乐（GD 源，单插件） | `https://raw.githubusercontent.com/data-cd-sky/MusicFree/eb1d0f7b63a790df2c369ba017352bc8db763094/ios/plugins/netease-gd.plugin.js` | 能播、能导入歌单；网易云搜索/歌词/封面都走 GD 镜像，避开 http 被 ATS 拦 |

如果不想一次装 11 个，B站用这个单插件地址：

`https://hebijunge.github.io/musicfree-plugins/plugins/bilibili-source.plugin.v1.1.4.js`

**注意：**

- 订阅/`.json` 地址会**一次安装 manifest 里的全部插件**，不是装一个。
- `qwerwhr` 的 76 个插件里混有 VIP/破解类，**不要整包订阅**；只单装上面的 GD音乐台即可。
- 安装失败先重试一次；超过 10 秒超时多半是网络抖动。
- 只有插件地址在本文档里，App 没有内置任何第三方订阅。

## 2. 哪些能播（一句话版）

- **能播**：QQ音乐、酷狗音乐、咪咕音乐、GD音乐台、B站、网易云音乐（GD 源）
- **只能搜、不能播**：官方 heb 网易云插件（取流是 http，被 iOS ATS 拦）、酷我、聚合、汽水（可留作歌词源）
- **别用**：Z 系列整源（接口是 http，被 iOS ATS 拦截）、qwerwhr 的酷我/酷狗、5sing、Apple Music、Jamendo（需自填 Client ID）

完整结果和逐插件说明见 `ios/PLUGIN-SOURCES.md`。

**网易云怎么播：** 官方 heb 网易云插件搜索/歌词正常，但取流返回 `http://m701.music.126.net`，iOS 播放器会被 ATS 拦。装上面的「网易云音乐（GD 源）」即可播放，实测《晴天》连续播放 22 秒无错误、歌词 65 行；不需要登录，不需要填 Cookie。它走 GD 的网易云镜像，极少数冷门歌可能搜不到。

**网易云歌单怎么导：** 设置 → 插件管理 → `网易云音乐（GD 源）` → **导入歌单**，粘贴 `https://music.163.com/playlist?id=...` 或 `https://y.music.163.com/m/playlist?id=...`。实测公开歌单「朗朗晴天」导入 15 首、15 首都能取到播放地址。私有歌单要先在插件的「用户变量」里填自己账号的 `MUSIC_U`；VIP/付费曲目会在标题后标「（VIP）/（付费）」，不保证能播，插件不做绕过。

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
- **http 接口被 ATS 拦**：只提供 `http://` 的插件（如 Z 系列、qwerwhr 酷狗）在 iOS 上不可用；官方 heb 网易云的播放地址也是 `http://m701.music.126.net`，所以另做了「网易云音乐（GD 源）」把地址升级成 https。App 保持 https-only，不放开任意 HTTP。
- **锁屏/灵动岛视觉待真机确认**：模拟器只能验证 ActivityKit 调用，最终排版、字号、刷新效果需要在 iPhone 上看。
- 官方 bilibili 插件的 `.m4s` 不能播；请用上面的 B站插件。

## 7. 装到真机（手机连上 Mac 后）

```bash
cd ~/code/musicfree-ios
scripts/ios-device.sh --check   # 检查签名证书和已连接 iPhone
scripts/ios-device.sh           # Release 构建 + 安装 + 启动
```

需要：Xcode 已登录 Apple ID、手机用数据线连接并点「信任」、打开「开发者模式」。
免费账号的证书 7 天过期，过期后重跑脚本即可。
