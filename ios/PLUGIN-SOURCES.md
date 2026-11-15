# iOS 插件源实测清单

面向 iPhone 的「装上就能用」插件源评测。结论只描述**当前时间点、当前 iOS ATS 策略**下的表现；
插件接口随时可能变化，失效时先重试，再考虑换源。

## 测试信息

| 项目 | 值 |
| --- | --- |
| 测试时间 | 2026-11-15 17:44–17:57（UTC+8） |
| 设备 | iPhone 17 Pro Max 模拟器，UDID `9959CA3C-AA80-4485-BED0-4E680F998704` |
| 系统 | iOS 27.2（runtime 24B8117） |
| App | `fun.upup.musicfree`，Debug + Metro，包含 P0 修复（`7d509a5` 及下载路径提示） |
| 网络 | 宿主 Mac 家庭 Wi-Fi，未走蜂窝网络 |
| 测试词 | 「晴天」，取搜索结果第一条 |
| 覆盖范围 | 4 个源、21 个代表插件（heb-main 6 个全测，其余源各 5 个） |
| 播放观测 | 点播后第 3s / 9s / 16s 记录 `state`、`position`、`duration`，同时监听 `PlaybackError` |
| 歌词观测 | 先调插件 `getLyric`，再调 App 自动搜歌词兜底 |
| ATS | 保持 https-only：未开启 `NSAllowsArbitraryLoads`，开启 `NSAllowsLocalNetworking` / `NSAllowsArbitraryLoadsForMedia` |
| 超时 | axios 全局 10s（`b788a03`：2s 会误伤慢接口，heb 作者明确说过 2s 会拖垮订阅/安装） |

判定标准：

- **可播放**：16s 内 `state=playing` 且 position 前进 >2s。若先报 1–2 次 `PlaybackError` 后自动换源成功，仍记为可播放，备注里说明。
- **可搜索但不能播**：搜索有结果，但 `state=error/buffering`、position 不前进，或取流超时。
- **不可用**：安装失败、搜索报错/超时、必须配置密钥、接口被 ATS 拦截。

## 结论速览

没有一个源是「全部插件都可用」。当前最稳的组合是：

1. `hebijunge main.json`（QQ音乐、酷狗音乐、咪咕音乐）
2. `qwerwhr plugins.json`（GD音乐台）
3. `hebijunge music.json`（B站）

heb-main 的 6 个插件里有 3 个可播（QQ/酷狗/咪咕），是可用率最高的源。日常使用按下面的
「最小可用安装集」装 5 个即可，不要把所有源全量导入：同名的插件会互相覆盖，
而且搜索页 tab 会变得很长。

## 四个订阅源

以下地址**只用于文档记录**，不要写进 App 代码或内置默认订阅。

| 源 | 订阅地址 | 清单规模 |
| --- | --- | --- |
| heb-main | `https://raw.githubusercontent.com/hebijunge/musicfree-plugins/master/sub/githubio/main.json` | 6 个（QQ/酷我/酷狗/咪咕/网易云/汽水） |
| heb-music | `https://raw.githubusercontent.com/hebijunge/musicfree-plugins/master/sub/githubio/music.json` | 11 个（B站/5sing/千千/一听/街声/Apple Music/华为/Jamendo/聚合/JOOX/好听轻音乐） |
| z | `https://raw.githubusercontent.com/martin65536/z-music-plugins/main/manifest.json` | 7 个（喜马拉雅/酷狗概念版/酷我/QQ/QQ歌词/哔哩哔哩/网易云） |
| qwerwhr | `https://cdn.jsdelivr.net/gh/qwerwhr/musicfree-plugins@main/plugins.json` | 76 个，含 GD音乐台及多个 VIP 破解插件 |

四个 manifest 本次均 HTTP 200，可正常订阅。qwerwhr 的 76 个里混有 `QQ Vip`、`QQ音乐（非VIP）`
等付费/破解类插件，**不推荐、不测试**，只测了 GD音乐台和几个主流平台。

### 订阅刷新实测

用 App 当前的 axios（10s 超时）重新拉取四个 manifest，模拟「更新订阅」：

| 源 | 结果 | 耗时 | manifest 大小（HTTP 字节） | 插件数 | 首项版本 |
| --- | --- | --- | --- | --- | --- |
| heb-main | ✅ 200 | 435ms | 1,317 | 6 | QQ音乐 1.9.26 |
| heb-music | ✅ 200 | 399ms | 2,228 | 11 | B站 1.1.4 |
| z | ✅ 200 | 409ms | 2,768 | 7 | 喜马拉雅 0.1.1 |
| qwerwhr | ✅ 200（jsDelivr 缓存命中） | 53ms | 12,043 | 76 | 5sing 1.0.0 |

注意：App 的「订阅」不是只存一个地址，添加时会**把 manifest 里的插件全部安装**。因此
qwerwhr 这种 76 个的源不要整包订阅；只想要最小集时，用各插件的单独 `.js` 地址逐个安装。

## 实测明细

### 1. heb-main（`sub/githubio/main.json`）

| 插件 | 搜索 | 播放 | 歌词 | 结论 / 备注 |
| --- | --- | --- | --- | --- |
| QQ音乐 | 10 条，首条「晴天 / 周杰伦」 | ✅ `playing`，2.8s → 15.8s / 269.7s | 插件 63 行 | **推荐**。开头 1 次 `PlaybackError` 后自动换源恢复 |
| 酷我音乐 | 19 条，首条「晴天 / 周杰伦」 | ❌ `error`，position 0 | 插件无歌词；App 兜底 71 行 | 仅可当搜索/歌词源 |
| 酷狗音乐 | 20 条，首条「晴天（温柔女声版）/ 吉拉朵」 | ✅ `playing`，1.5s → 14.5s / 295.5s | 插件 76 行 | **推荐**。首条是翻唱，找原唱需翻列表；有 3 次瞬时错误后恢复 |
| 咪咕音乐 | 20 条，首条「晴天 / 周杰伦」 | ✅ `playing`，3.0s → 16.1s / 269.7s | 插件 65 行 | **推荐**。开头 1 次瞬时错误后恢复 |
| 网易云音乐 | 20 条，首条「晴天（原唱 周杰伦）/ RyaVocal」 | ❌ `error`，position 0 | 插件 64 行 | 官方取流返回 http CDN，被 ATS 拦；用下方「网易云音乐（GD 源）」可播 |
| 汽水音乐 | ❌ 搜索失败「汽水源请求失败」 | — | — | 不可用（插件接口报错） |

### 2. heb-music（`sub/githubio/music.json`）

| 插件 | 搜索 | 播放 | 歌词 | 结论 / 备注 |
| --- | --- | --- | --- | --- |
| B站 | 20 条，首条「【Hi-Res无损音质】｜《晴天》…」 | ✅ `playing`，0.75s → 13.8s / 269.5s | 插件无歌词；App 兜底 22 行 | **推荐**，适合视频/现场/冷门资源；音质取决于投稿 |
| 5sing | ❌ `Network Error` | — | — | 不可用（接口网络错误） |
| Apple Music | ❌ `apple token step1 failed: index-legacy js not found in homepage` | — | — | 不可用（Apple 页面改版，插件取 token 失效） |
| Jamendo | ❌ 未配置 Jamendo Client ID | — | — | 开箱不可用；需去 developer.jamendo.com 注册后填插件设置 |
| 聚合 | 30 条，首条「晴天 / 梅菜扣肉肉」 | ❌ `PLAY_TIMEOUT`，取流阶段卡死 | 插件 56 行 | 仅可当搜索/歌词源 |

### 3. z-music-plugins（`manifest.json`）

| 插件 | 搜索 | 播放 | 歌词 | 结论 / 备注 |
| --- | --- | --- | --- | --- |
| 喜马拉雅有声书（实际名 `Z·喜马拉雅`） | ❌ `Network Error` | — | — | 不可用 |
| 酷狗概念版（`Z·酷狗`） | ❌ `Network Error` | — | — | 不可用 |
| 酷我音乐（`Z·酷我`） | ❌ `Network Error` | — | — | 不可用 |
| QQ音乐（`Z·QQ音乐`） | ❌ `Network Error` | — | — | 不可用 |
| 网易云音乐（`Z·网易云`） | ❌ `Network Error` | — | — | 不可用 |

**整源不可用**。抽查插件源码后确认接口全部走 `http://ws.suol.cc/...`，iOS 的 ATS 只允许 https，
请求在发出前就被拦截。除非用户明确同意放开 ATS，否则这个源在 iOS 上不要用。

### 4. qwerwhr（`plugins.json`）

| 插件 | 搜索 | 播放 | 歌词 | 结论 / 备注 |
| --- | --- | --- | --- | --- |
| GD音乐台 | 20 条，首条「晴天（原唱 周杰伦）/ RyaVocal」 | ✅ `playing`，2.4s → 15.4s / 268.8s | 插件无歌词；App 兜底 64 行 | **推荐**。内容 hash 与已用的 GD 插件一致；有 2 次瞬时错误后恢复 |
| 酷我 | 安装首次 10s 超时；重试安装成功，搜索 ❌ `Network Error` | — | — | 不可用（插件本体是 gitee 加载器，网络失败） |
| 酷狗 | 安装首次 10s 超时；重试安装成功，搜索 ❌ `Network Error` | — | — | 不可用（搜索接口为 `http://mobilecdn.kugou.com`，被 ATS 拦截） |
| 网易云 | 30 条，首条「晴天（原唱 周杰伦）/ RyaVocal」 | ❌ `error`，position 0 | 插件 30 行 | 取流 API 返回 429（Cloudflare Workers 每日额度用尽），不是 ATS；详见下方专项 |
| 汽水音乐 | 20 条，首条「晴天 / 晚风纯音」 | ❌ `PLAY_TIMEOUT` | 插件 23 行 | 仅可当搜索/歌词源 |

注：两个「安装超时」是 jsDelivr 首次拉取超过 10s，重试即成功，属于网络抖动，不是插件损坏。
不要为此继续调大全局超时。

## 网易云播放专项（2026-11-15 19:20–19:40 补测）

用户点名要解决「网易云源不能播」。结论：**官方 heb 插件的失败原因是 http CDN 被 iOS ATS 拦，
不是登录/VIP/版权/地区限制；GD 的取流接口返回同一个网易云 CDN 的 https 地址，所以把 GD 的
取流逻辑做成独立插件即可播放。**

### 官方 heb 网易云（`netease` 1.9.27）

在模拟器用 CDP 直接调用插件方法，抓到完整链路：

| 请求 | 结果 |
| --- | --- |
| `GET https://music.163.com/api/cloudsearch/pc`（搜索「晴天」） | 200，20 条结果 |
| `GET https://music.163.com/api/song/enhance/player/url` | 200 |
| `POST https://interface3.music.163.com/eapi/api/song/enhance/player/url/v1` | 200（ArrayBuffer） |
| 插件 `getMediaSource()` 返回值 | `http://m701.music.126.net/2026.../....mp3?...` |
| 插件自带的 `GET http://m701.music.126.net/...`（`Range: bytes=0-0`，2s 超时） | `AxiosError: Network Error`，请求在 ATS 层就被拦，未到服务器 |
| 同一个 CDN URL 改成 `https://` 后 `curl` | `HTTP/2 206`，`content-type: audio/mpeg` |

判定：不是 403/404/302；不是 VIP/版权/地区；UA/Referer 已带；没有 Cookie 也能拿到地址。
唯一的失败点是 **`http://m701.music.126.net` 被 ATS 拦截**。按约定只记录域名，没有修改
`Info.plist`，App 继续保持 https-only。

### qwerwhr 网易云（`网易云` 0.1.0）

搜索 30 条正常，播放时 `getMediaSource()` 返回 `null`。请求证据：

| 请求 | 结果 |
| --- | --- |
| `POST https://api.music.lerd.dpdns.org/mf/wy` | **429**，响应体前 500 字符：`{"type":"https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/","title":"Error 1027: This website has been temporarily rate limited","status":429,"detail":"The site owner has exceeded their Workers free tier daily request limit. The limit resets at midnight UTC.","error_code":1027,"error_name":"workers_daily_limit","error_category":"rate_limit"}` |
| 备用 `https://share.duanx.cn/url/wy/2668397359/128k` | TLS 握手失败（curl exit 35），不是 ATS |

判定：qwerwhr 的失败是**上游 API 429 限流**，不是 Cookie，也不是 ATS。它不能作为稳定播放源。

### GD 的取流实现（可移植的部分）

GD 插件的 `getMediaSource(musicItem, quality)` 只做一件事：

```
GET https://music-api.gdstudio.xyz/api.php
    ?types=url&source=netease&id=<网易云数字 id>&br=<128|320|740|999>
→ { "url": "https://m801.music.126.net/...mp3", "br": 320, "size": 10831725 }
```

同一个 `id=2668397359` 的实测返回：

```
{"url":"https://m801.music.126.net/2026.../....mp3","br":320,"size":10831725,"from":"music.gdstudio.xyz"}
```

对比官方插件：搜索/歌词走 `music.163.com`，取流最终拿到的也是网易云 CDN，但返回的是
`http://m701...`；GD 返回的是 `https://m801...`。差别只在**取流入口和 scheme**，不需要登录，
也没有 VIP 绕过。

### 可直接安装的独立插件

已把 GD 的取流逻辑适配成独立网易云插件：

| 项目 | 值 |
| --- | --- |
| 文件 | `ios/plugins/netease-gd.plugin.js`（约 17 KB，可读源码） |
| 插件名 | `网易云音乐（GD 源）` |
| 安装地址（固定版本，推荐） | `https://raw.githubusercontent.com/data-cd-sky/MusicFree/eb1d0f7b63a790df2c369ba017352bc8db763094/ios/plugins/netease-gd.plugin.js` |
| 安装地址（跟随分支） | `https://raw.githubusercontent.com/data-cd-sky/MusicFree/ios/port/ios/plugins/netease-gd.plugin.js`（jsDelivr 分支缓存可能滞后，不建议用于首次安装） |
| 支持 | 搜索（music/album/artist）、播放、歌词、封面、歌单导入、`getMusicSheetInfo`；音质 low/standard/high/super → 128/320/740/999 |
| 不含 | 登录、VIP/付费破解、DRM 破解；接口没返回地址的歌曲就是不能播 |

**复现步骤：**

1. 设置 → 插件管理 → 右下角 `+` → 从网络安装插件。
2. 粘贴上面的固定版本地址（分支地址用于后续更新），安装成功后会多出「网易云音乐（GD 源）」。
3. 搜索「晴天」，点第一首；实测 `playing`，position 从 0 前进到 22.3s / 270.74s，无 `PlaybackError`。
4. 歌词实测 65 行；封面返回 `https://p2.music.126.net/...jpg?param=500y500`。

**登录 Cookie（`MUSIC_U`）说明：**

本次实测的公开歌单/歌曲不需要 Cookie。如果要导入**自己账号可见的私有歌单**，在
设置 → 插件管理 → `网易云音乐（GD 源）` → 用户变量 → **网易云 Cookie（可选，仅私有歌单）**
里粘贴自己账号的 `MUSIC_U=...`。插件只把它用于 `music.163.com` 的歌单详情请求，
不参与 GD 取流，也不会绕过 VIP/付费。**不要使用他人 Cookie，不要用来绕过付费墙**；
没有权限的歌单/歌曲仍然会失败，这是预期行为。

官方 heb 插件里的同名 `neteaseCookie` 是它自己的设置项，与本插件互不影响。

**差距：**

- 这个插件的搜索/歌词/封面走 GD 的网易云镜像，不是 `music.163.com` 官方接口；曲库和排序
  与官方基本一致（「晴天」首条相同），但极少数冷门歌/新歌可能搜不到或没有歌词。
- 官方 heb 插件仍可保留，只用于官方搜索/歌词；它的播放仍会被 http CDN 拦截。
- 如果 GD 接口本身限流/宕机，本插件也会取不到流；届时换回官方插件搜索，或等 GD 恢复。

## 网易云歌单导入专项（2026-11-15 19:40–20:05 补测）

用户要求网易云源同时满足**能搜、能播、能导入网易歌单**。歌单导入走 App 的
「插件页 → 该插件 → 导入歌单」入口，实际调用 `plugin.methods.importMusicSheet(url)`；
导入成功后 App 再用 `AddToMusicSheet` 面板写入「我的歌单」。

### 四个插件的导入能力

| 插件 | `importMusicSheet` | `getMusicSheetInfo` | 实测结果 |
| --- | --- | --- | --- |
| heb 官方 `netease` 1.9.27 | 已注册 | 已注册 | 底层 `_internal.importMusicSheetImpl` 能拿到「朗朗晴天」15 首，但返回的是**歌单对象**（`{title, musicList, ...}`），不是 App 期望的歌曲数组；`p.methods.importMusicSheet` 实测返回 0。`getMusicSheetInfo({id:"2678496359"})` 报「该条目无可用的歌单详情源」 |
| qwerwhr `网易云` 0.1.0 | 已注册 | 已注册 | `importMusicSheet` 返回 15 首；`getMusicSheetInfo` 返回「朗朗晴天」15 首、`isEnd=true`。但 `getMediaSource` 取流 API 仍返回 429，导入后不能播 |
| GD `GD音乐台` 1.0.0 | 无 | 无 | 不支持歌单导入 |
| 本插件 `网易云音乐（GD 源）` 1.1.0 | 已注册 | 已注册 | 15 首导入成功，写入本地歌单 15 首；15/15 能取到 https 流；首曲实测 `playing` |

结论：**heb/qwerwhr 的导入功能不能直接满足「导入后能播」**。heb 是返回结构不兼容，
qwerwhr 是能导入但取流 429；GD 根本没有导入。所以由本插件同时实现导入和可播取流。

### 端到端实测

测试歌单：网易云公开歌单 **「朗朗晴天」**，ID `2678496359`，共 15 首。

| 步骤 | 结果 |
| --- | --- |
| 粘贴 `https://music.163.com/playlist?id=2678496359` | 识别 ID `2678496359`，导入 15 首 |
| 粘贴 `https://y.music.163.com/m/playlist?id=2678496359` | 导入 15 首 |
| 直接粘贴数字 `2678496359` | 导入 15 首 |
| `getMusicSheetInfo` | 歌单名「朗朗晴天」，`musicList` 15 首，`isEnd=true`，封面 https |
| 写入本地「我的歌单」（与 `AddToMusicSheet` 面板相同的 `addSheet`/`addMusic`） | 歌单 15 首，平台显示「网易云音乐（GD 源）」 |
| 播放第一首 | 最终 `playing`，position 0 → 5.36s / 21.54s；从固定 URL 重装后的首播有 1 次瞬时 `error`，约 2s 后自动恢复 |
| 全部 15 首 `getMediaSource("standard")` | **15/15** 返回 https 地址，0 失败 |

大歌单补充：公开「热歌榜」ID `3778678` 实测导入 **200 首**；按 `fee` 字段标记
**126 首 VIP、74 首免费**；抽样 5 首 VIP + 5 首免费，GD 均返回 https 地址，未逐首播放。
歌单详情接口只返回前 10 首时，插件会用 `/api/song/detail` 按 `trackIds` 补齐；
15 首歌单就是这样拿到全量的。

### VIP / 付费曲目

- 导入时按网易云 `fee` 字段给标题加后缀：`fee=1` → `（VIP）`，`fee=4` → `（付费）`。
- 同时在 `_rawData._vip` 保留标记，**不做任何绕过**；GD 接口没返回地址的歌曲播放时会
  走 App 正常的失败提示，不会伪装成功。
- 标记只代表平台的 VIP/付费属性，不代表一定能播或一定不能播；能否播放取决于接口
  当时返回的地址。实测抽样的 VIP 曲目 GD 也返回了地址，但本插件不对此作保证。

### 链接解析与失败点

支持的输入：

- `https://music.163.com/playlist?id=...`
- `https://y.music.163.com/m/playlist?id=...`
- `https://music.163.com/#/playlist?id=...`
- `https://music.163.com/playlist/<id>/...`
- 纯数字歌单 ID

不支持的输入：`163cn.tv` 短链、需要登录才能看的私有歌单在没有 Cookie 时、已删除/违规歌单。
失败时 `importMusicSheet` 返回空数组，App 弹「导入失败」，不会写入空歌单。

### 私有歌单 Cookie

公开歌单不需要 Cookie。私有歌单需要用户自己账号的 `MUSIC_U`：

1. 设置 → 插件管理 → `网易云音乐（GD 源）` → 用户变量。
2. 在「网易云 Cookie（可选，仅私有歌单）」里粘贴 `MUSIC_U=...`（只填自己账号的值）。
3. 回到插件页 → 导入歌单 → 粘贴私有歌单链接。

Cookie 只用于 `music.163.com/api/v6/playlist/detail` 和 `api/song/detail` 请求，
不参与 GD 取流；不会绕过 VIP/付费。**没有真实私有歌单可测**，这条路径按代码和未登录
失败表现记录，未做账号实测；如果填了 Cookie 仍失败，说明该歌单还要求别的登录校验，
插件不会继续绕过。

## 最小可用安装集

目标：装完就能搜、能播、能有歌词，tab 又不至于太多。

| 顺序 | 插件 | 安装方式 | 可直接复制的地址 | 作用 |
| --- | --- | --- | --- | --- |
| 1 | QQ音乐 | 单插件 | `https://hebijunge.github.io/musicfree-plugins/plugins/qq-source.plugin.v1.9.26.js` | 主曲库，搜索/播放/歌词都通过 |
| 2 | 酷狗音乐 | 单插件 | `https://hebijunge.github.io/musicfree-plugins/plugins/kugou-source.plugin.v1.9.24.js` | 备用曲库；首条常是翻唱，选原唱版本即可 |
| 3 | GD音乐台 | 单插件 | `https://cdn.jsdelivr.net/gh/qwerwhr/musicfree-plugins@main/GD%E9%9F%B3%E4%B9%90%E5%8F%B0.js` | 聚合音源，可播放；歌词靠 App 兜底 |
| 4 | B站 | 单插件 | `https://hebijunge.github.io/musicfree-plugins/plugins/bilibili-source.plugin.v1.1.4.js` | 视频/现场/冷门资源，可播放；歌词靠 App 兜底 |
| 5 | 网易云音乐（GD 源） | 单插件 | `https://raw.githubusercontent.com/data-cd-sky/MusicFree/eb1d0f7b63a790df2c369ba017352bc8db763094/ios/plugins/netease-gd.plugin.js` | 网易云搜索/播放/歌词/歌单导入；播放地址为 https，避开 ATS |

也可以直接订阅 **heb-main**（`https://raw.githubusercontent.com/hebijunge/musicfree-plugins/master/sub/githubio/main.json`），
一次装 6 个：QQ、酷狗、咪咕可播，酷我、网易云可搜，汽水当前搜索失败。

**heb-music 订阅会一次装 11 个插件，本次实测的 5 个里只有 B站 可播**；嫌多就用上表 B站 的单个 `.js` 地址，
不要整包订阅（其余 6 个未逐个试播，不值得为它们多装 10 个）。GD音乐台必须用上面的**百分号编码**地址（`GD%E9%9F%B3%E4%B9%90%E5%8F%B0.js`），
直接贴中文文件名在部分客户端会 404。

可选「歌词源」：网易云（heb-main 或 qwerwhr）。它自己不能播，但插件歌词可用，能补 GD/B站
没有歌词的情况。酷我（heb-main）同理，但优先级更低。

想要更多主流曲库时，可以再加 **咪咕音乐**（heb-main，可播 + 插件歌词；单插件地址
`https://hebijunge.github.io/musicfree-plugins/plugins/migu-source.plugin.v1.9.19.js`）；
它和酷狗二选一即可，不必都装。

只需要一个源时：先订 **heb-main**（或单装 QQ + 酷狗）；不够再补 GD 和 B站。

## 已知失效清单

| 插件 / 源 | 失败表现 | 原因 | 处理 |
| --- | --- | --- | --- |
| z 源全部 5 个 | 搜索 `Network Error` | 接口为 `http://ws.suol.cc`，ATS 拦截 | iOS 上整源不用；不改 ATS |
| qwerwhr 酷狗 | 搜索 `Network Error` | `http://mobilecdn.kugou.com` 等 http 接口 | 同上 |
| qwerwhr 酷我 | 搜索 `Network Error` | 插件从 gitee 拉取二次脚本失败 | 换 heb-main 的酷我（可搜不可播） |
| heb 5sing | 搜索 `Network Error` | 站点/接口网络错误 | 暂不可用 |
| Apple Music | `index-legacy js not found in homepage` | Apple 页面改版，token 抓取失效 | 等插件更新 |
| Jamendo | 要求 Client ID | 插件设计为自带密钥 | 注册后填设置；否则别装 |
| heb 聚合 | `PLAY_TIMEOUT` | 聚合取流卡死 | 只当搜索/歌词源 |
| heb 汽水 | 搜索「汽水源请求失败」 | 插件接口报错 | 暂不可用 |
| heb 网易云 | 可搜不可播，position 0 | 官方取流返回 `http://m701.music.126.net`，ATS 拦截 | 装上面的「网易云音乐（GD 源）」；官方插件留作搜索/歌词 |
| heb 网易云歌单导入 | 导入返回 0 首 | `importMusicSheetImpl` 返回歌单对象（`musicList` 嵌套），App 期望数组；`getMusicSheetInfo` 对纯 ID 报「该条目无可用的歌单详情源」 | 不用 heb 导入；用「网易云音乐（GD 源）」的导入 |
| heb 酷我 | 可搜不可播 | 取流接口被平台限制 | 只当搜索/歌词源 |
| qwerwhr 网易云 | 可搜 30 条、播放 error；歌单可导入 15 首但导入后不能播 | 取流 API `api.music.lerd.dpdns.org/mf/wy` 返回 429（Cloudflare Workers 每日额度） | 不用；改用「网易云音乐（GD 源）」 |
| qwerwhr VIP 类插件 | 未测试 | 付费/破解类 | 不推荐、不内置 |

## 使用建议

- 订阅后先在搜索页逐个平台搜「晴天」，能出结果不代表能播，**一定要点第一首听 15 秒**。
- 播放失败时会弹「《歌名》播放失败：原因，已自动跳到下一首/已暂停」；若连续失败，换上面「最小可用安装集」里的插件。
- 网易云歌单导入用「网易云音乐（GD 源）」：插件页 → 该插件 → 导入歌单，粘贴
  `https://music.163.com/playlist?id=...` 或 `y.music.163.com/m/playlist?id=...`；私有歌单先在
  用户变量填自己的 `MUSIC_U`。
- 同名插件会互相覆盖。比如 qwerwhr 的 GD音乐台与已有 GD 插件内容相同，装一个即可。
- 下载完成的提示会给出文件位置：iOS 在「文件」App → 我的 iPhone → MusicFree → `download/music`
  （自定义下载目录时显示相对 Documents 的路径）。
- 第三方订阅地址只作为文档参考，App 不内置、不硬编码；是否需要预置由用户自己决定。
