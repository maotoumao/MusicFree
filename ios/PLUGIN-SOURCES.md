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
「最小可用安装集」装 4 个即可，不要把所有源全量导入：同名的插件会互相覆盖，
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
| 网易云音乐 | 20 条，首条「晴天（原唱 周杰伦）/ RyaVocal」 | ❌ `error`，position 0 | 插件 64 行 | 仅可当搜索/歌词源 |
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
| 网易云 | 30 条，首条「晴天（原唱 周杰伦）/ RyaVocal」 | ❌ `error`，position 0 | 插件 30 行 | 仅可当搜索/歌词源 |
| 汽水音乐 | 20 条，首条「晴天 / 晚风纯音」 | ❌ `PLAY_TIMEOUT` | 插件 23 行 | 仅可当搜索/歌词源 |

注：两个「安装超时」是 jsDelivr 首次拉取超过 10s，重试即成功，属于网络抖动，不是插件损坏。
不要为此继续调大全局超时。

## 最小可用安装集

目标：装完就能搜、能播、能有歌词，tab 又不至于太多。

| 顺序 | 插件 | 来源 | 作用 |
| --- | --- | --- | --- |
| 1 | QQ音乐 | heb-main | 主曲库，搜索/播放/歌词都通过 |
| 2 | 酷狗音乐 | heb-main | 备用曲库；首条常是翻唱，选原唱版本即可 |
| 3 | GD音乐台 | qwerwhr | 聚合音源，可播放；歌词靠 App 兜底 |
| 4 | B站 | heb-music | 视频/现场/冷门资源，可播放；歌词靠 App 兜底 |

可选「歌词源」：网易云（heb-main 或 qwerwhr）。它自己不能播，但插件歌词可用，能补 GD/B站
没有歌词的情况。酷我（heb-main）同理，但优先级更低。

想要更多主流曲库时，可以再加 **咪咕音乐**（heb-main，可播 + 插件歌词）；它和酷狗二选一即可，
不必都装。

只需要一个源时：先订 **heb-main**，装 QQ + 酷狗；不够再补 GD 和 B站。

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
| heb 网易云 / 酷我 | 可搜不可播 | 取流接口被平台限制 | 只当搜索/歌词源 |
| qwerwhr VIP 类插件 | 未测试 | 付费/破解类 | 不推荐、不内置 |

## 使用建议

- 订阅后先在搜索页逐个平台搜「晴天」，能出结果不代表能播，**一定要点第一首听 15 秒**。
- 播放失败时 App 会弹「播放失败，已自动跳到下一首」；若连续失败，换上面「最小可用安装集」里的插件。
- 同名插件会互相覆盖。比如 qwerwhr 的 GD音乐台与已有 GD 插件内容相同，装一个即可。
- 下载完成的提示会给出文件位置：iOS 在「文件」App → 我的 iPhone → MusicFree → `download/music`
  （自定义下载目录时显示相对 Documents 的路径）。
- 第三方订阅地址只作为文档参考，App 不内置、不硬编码；是否需要预置由用户自己决定。
