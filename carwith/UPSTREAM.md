# 面向上游维护者的改动说明：CarWith 车机歌词 / 车机深浅色跟随

> 基线：`maotoumao/MusicFree` commit `f82436a7770420f9258b795081120be7cdd5e79c`
> （2026-06-19 `修复：稳定性与跨平台优化`，`package.json` 仍是 0.6.2）。
> 本分支：`v0.6.2-carwith`。
>
> 本文件只回答「改了什么、为什么这么改、怎么验、建议怎么合」。
> 逐锚点的规格、键名契约、构建/运行期踩坑登记、APK 断言与登记值，
> 全在同目录 [MusicFree-CarWith-重做说明.txt](./MusicFree-CarWith-重做说明.txt)；
> 构建与自检命令见 [README.md](./README.md)。

## 1. 解决什么问题

小米 CarWith 4.0.20（以及同协议的 Jovi InCar）投屏时，车机歌词只读
`MediaSession` 元数据里的 `ucar.media.metadata.LYRICS_*` 私有键，并且要求
「换句就重发整份 metadata」。MusicFree 的歌词在 JS/`lyricManager` 里，
原生媒体会话由 `react-native-track-player`（RNTP）→ `react-native-kotlin-audio`
→ ExoPlayer 这条链维护，车机侧拿不到歌词。

本改动在「连着车机且用户打开开关」时才把整首 LRC / 当前句写进媒体会话，
并额外支持主题跟随车机深浅色。只涉及 Android，默认关闭。

## 2. 默认零影响（review 时优先看这一条）

总设定：**没连 CarWith，或开关没勾 —— 上游行为逐字不变。**

代码里有四道独立的门，任何一道不满足都不会进入适配逻辑：

1. `CarWithLyric.decorate()` 首句 `if (!(connected && enabled)) return base;`
2. `CarWithState` 的 5 秒心跳只在两把开关至少一把打开时排程；全关时连虚拟屏都不枚举。
3. JS `pushLyricState()` 首句 `if (!lyricEnabled) return;`。
4. 原生 `publish()` 的 `dirty` 位：从没贴过键时直接早退，不装 provider、不碰 connector、
   不发 `setMetadata`。

第 4 条是后加的，原因是踩过一次真实的 `StackOverflowError`：RNTP 的
`MediaSessionConnector.setMediaMetadataProvider()` 在设置 provider 的**当次调用**里
就会回调该 provider；如果在 provider 回调里再装 provider，就会无限递归。
完整根因与修法见《重做说明》「四、构建」运行期踩坑 8)。

## 3. 分层与文件职责

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 连接态 / 深浅色 | `android/.../carwith/CarWithState.kt`、`CarWithStatePackage.kt`、`MainApplication.kt` | 虚拟屏名 + 反射 `Display.getType()==5` 判连接；读 `Settings.Global.ucar_night_mode`；`ContentObserver` + 5 秒心跳；向 JS 发 `onCarWithStateChange` |
| 媒体会话注入 | `patches/react-native-track-player+4.1.1.patch`、`carwith/tools/apply-rntp-carwith.js` | RNTP 的 5 个锚点 + 新增 `carwith/CarWithLyric.kt`；装完依赖后由脚本落地（`node_modules` 不入 Git） |
| JS 聚合 | `src/core/carWithLyric.ts`、`src/native/carWithState/index.ts`、`src/core/lyricManager.ts`、`src/entry/bootstrap/bootstrap.ts`、`src/core/theme.ts` | 开关持久化；整首 LRC 组装（补回 offset）；换曲/换句/无词三路推送；主题跟随判定 |
| 设置与文案 | `src/types/core/config.d.ts`、`basicSetting.tsx`、`themeSetting/mode.tsx`、三个 i18n JSON | 两个新配置键、两个开关、中英繁文案 |
| 本地构建档 | `android/app/build.gradle`、`android/gradle.properties` | 仅 arm64-v8a、release 用仓库自带 debug.keystore（**只为可复现，不建议合入上游**） |

一次换句的数据流：

```text
ExoPlayer 1s 定时器 → RNTP PlaybackProgressUpdated
  → lyricManager 进度回调（文本真翻了才走）
  → CarWithLyric.pushLyricState(parser, line)
  → TrackPlayerModule.setCarWithLyric → MusicService → CarWithLyric.update()
  → MediaSessionCompat.setMetadata(decorated) → 车机读 LYRICS_WHOLE 排行
```

## 4. 关键取舍（为什么不是更简单的写法）

- **每次换句重发整份 metadata**：RNTP 开了 `setMetadataDeduplicationEnabled(true)`，
  按 mediaId 去重，只挂 provider 不会触发第二次；必须直接 `setMetadata()`。
- **无词/加载中显式清空**：不写键就会把上一首留在会话里，车机停在最后一句。
- **整首时间戳加回 offset**：`LrcParser.getPosition()` 减了 `meta.offset`，
  `item.time` 是不含偏移的原始值，直接推会满屏错位。
- **整首上限 24000 字符，超限发空串**：同一份 metadata 里还有封面位图，
  超 Binder 事务上限会整包丢失；截断会让最后一句永远对不上，发空串则退回逐句。
- **封面**：不发布 `METADATA_KEY_MEDIA_URI`（否则 CarWith 去扒音频内嵌图）；
  `ART_URI`/`ALBUM_ART_URI`/`DISPLAY_ICON_URI` 三个一起断；只保留一张位图。
- **连接判据**：屏名含 `com.miui.carlink` / `com.xiaomi.ucar.minimap`，且反射取到的
  `Display.getType()==5`；不匹配 `com.autonavi.minimap`（那是资源 ID，不是屏名）。
- **深浅色不写 Config**：只改内存主题，断开/关开关即 `restoreStoredTheme()`；
  观察者必须留强引用，另配 5 秒心跳兜底个别 ROM 不发 `onChange`。
- **适配失败不冒泡到播放路径**：原生三处入口全包 `try/catch`，失败只打一行 `Log.w`。

## 5. 提交拆分（便于按需 cherry-pick）

| # | 提交 | 内容 | 是否建议合入 |
| --- | --- | --- | --- |
| 1 | `feat(carwith): 原生连接态与车机深浅色模块` | `CarWithState.kt`、`CarWithStatePackage.kt`、`MainApplication.kt` | 是 |
| 2 | `feat(carwith): 向 RNTP 媒体会话注入车机歌词` | RNTP 补丁 + 落地脚本 + `.gitattributes` | 视 RNTP 策略，见第 7 节 |
| 3 | `feat(carwith): JS 侧歌词推送与主题跟随` | JS 聚合 5 文件 | 是 |
| 4 | `feat(carwith): 设置开关与中英繁文案` | 配置键、设置页、i18n | 是 |
| 5 | `docs(carwith): 重做说明与 APK 自检工具` | 文档、`check_apk.py/.ps1`、本文件 | 可只取文档 |
| 6 | `chore(carwith): 本地构建档（arm64 + 公签）` | `build.gradle`、`gradle.properties` | **否**，仅本地复现用 |

总计：12 个已有文件 + 4 个新文件（仓库内），外加 `node_modules` 里的 RNTP 补丁。
`node_modules` 不进 Git，所以 RNTP 的 5 个锚点 + 1 个新文件以 patch-package 格式放在
根目录 `patches/`，由 `carwith/tools/apply-rntp-carwith.js` 在 `npm install` 之后落地。

## 6. 验证做到哪一步

- **基线一致**：本分支的父提交 tree 与上游 `f82436a7` 的 tree 相同
  （`31ae08c8267aa316d9f5231388fc08d69eba4704`）。
- **源码一致**：5 个新文件的 bytes/sha256 与《重做说明》「八、登记值」逐项相等；
  RNTP 补丁里的 `CarWithLyric.kt` 重建后 sha256 也等于登记值。
- **成品自检**：`carwith/tools/check_apk.py` 九组断言 ALL PASS（四个歌词键名、
  `ucar_night_mode`、类/方法/事件名、七条加固提示串、JS 配置键、三语文案、
  签名证书、badging、内部产物 sha256）。登记值见《重做说明》「八」。
- **未覆盖**：手边没有真车，车机侧 10 条行为（歌词跟随、熄屏跟随、断连重连、
  超长歌词、偏移等）尚未实车复验，清单见《重做说明》「九」。
  目前验证边界是「编译通过 + APK 断言全绿 + 源码级逐条对照 CarWith 契约 +
  本地装机播放不闪退」。

## 7. 给上游的合入建议

1. **先合 1/3/4**：连接态、JS 推送、设置项与文案，均为新增文件/新增分支，
   对既有逻辑只有「在合适位置调用一次」级别的侵入，且门控为假时零行为变化。
2. **RNTP 补丁单独讨论**。当前实现必须改 `node_modules` 里的 RNTP，原因有两个：
   - 歌词键要在 RNTP 内部的 `MediaSessionConnector` 上发布；
   - 逐句重发必须绕开 RNTP 的 metadata 去重。
   若上游接受 patch-package，保留第 2 个提交即可；若希望零依赖补丁，可讨论两条路：
   - 在 RNTP 上游增加「自定义 metadata 装饰器 / 额外键」扩展点；
   - 或把 CarWith 歌词做成 App 内独立原生模块，通过反射直接操作 MediaSession
     （本项目已用反射拿 session/connector，但 provider 安装点仍在 RNTP 内部）。
3. **不要合第 6 个提交**：debug.keystore 公签与 arm64-only 只是为了让第三方能
   逐字节复现本次交付产物，正式发行应保持上游的签名与 ABI 配置。
4. **文档可独立保留**：`carwith/` 下的说明与自检脚本不依赖上述代码合入，
   对复现和回归都有用。

## 8. 许可

- MusicFree 本体 **AGPL-3.0**：分发改后的 APK 需同时提供对应源码；本分支 +
  `patches/` 即为对应源码。
- RNTP 为 **Apache-2.0**：`patches/react-native-track-player+4.1.1.patch`
  是其修改衍生，未把 RNTP 源码复制进本仓库，以补丁形式隔离。
