# MusicFree × CarWith 适配 —— 源码同步说明

分支：`v0.6.2-carwith`（6 个提交，父提交就是下面那个基线）　基线：上游 `maotoumao/MusicFree`
commit `f82436a7770420f9258b795081120be7cdd5e79c`（2026-06-19 `修复：稳定性与跨平台优化`，
`package.json` 里 version 仍是 `0.6.2`）。这份 clone 里上游历史完整，可以直接和 upstream 做
rebase / cherry-pick。分支名带版本号是为了不和顶层 `carwith/` 目录同名 —— 同名时
`git checkout carwith` 之类命令会报「ambiguous argument」。

对应交付物（已装车实测可用）：

| 项 | 值 |
| --- | --- |
| APK | `app-arm64-v8a-release.apk`，18,185,688 B |
| APK sha256 | `c896c3548876d979c163e9cbf76a71339f19afa3bc978f5417742e30f49b1446` |
| classes.dex sha256 | `9203be8604e46c28b05c0cc21bc42a60cda35a725c879a3088d063b93307cb01` |
| assets/index.android.bundle sha256 | `af6475c530f4a0a8dd19394a6ec851b04b068db20a3e3268cb44eae686127e30` |
| versionCode / versionName | `400011` / `0.6.2` |
| 依赖钉值 | `react-native-track-player` 实际解析到 `4.1.1` |

功能与实现原理不在这里重复，见同目录
[MusicFree-CarWith-重做说明.txt](./MusicFree-CarWith-重做说明.txt)（一、功能 ~ 九、装车复验点，
九组 APK 断言、踩坑登记、负载全在那一个 txt 里，自带 `restore.py`）。

---

## 1. 改动落在哪

《重做说明》里的 40 处改动 = 35 个文本锚点 + 5 个新文件，在这个分支里分成两半：

**A. 仓库内（Git 直接跟踪，共 16 个文件）**

- 30 个锚点：`android/app/build.gradle`(2) `android/gradle.properties`(1)
  `MainApplication.kt`(3) `src/core/lyricManager.ts`(5) `src/core/theme.ts`(2)
  `src/entry/bootstrap/bootstrap.ts`(2) `src/types/core/config.d.ts`(2)
  `basicSetting.tsx`(4) `themeSetting/mode.tsx`(3) 三个 i18n JSON(各 2)
- 4 个新文件：`android/app/src/main/java/fun/upup/musicfree/carwith/CarWithState.kt`、
  同目录 `CarWithStatePackage.kt`、`src/native/carWithState/index.ts`、`src/core/carWithLyric.ts`

**B. npm 依赖里（`node_modules` 不进 Git，所以走补丁文件）**

- `patches/react-native-track-player+4.1.1.patch` —— patch-package 命名与格式，
  含 RNTP 的 5 个锚点（`MusicService.kt` 4 处 + `MusicModule.kt` 1 处）和新文件
  `carwith/CarWithLyric.kt`。
- `carwith/tools/apply-rntp-carwith.js` —— 零依赖落地脚本，`npm install` 之后跑一次。

A + B 合起来才是完整的 40 处；只 clone 不跑 B，得到的是**没有车机歌词**的源码。

> 为什么这些工具放在 `carwith/tools/`：上游 `.gitignore` 第 82 行是 `scripts/`，
> 这条规则匹配**任意层级**的 scripts 目录（顶层和 `carwith/scripts/` 都进不了 Git），所以改名 tools。
> 补丁仍留在根目录 `patches/`，因为那是 patch-package 认的位置（想改用 `npx patch-package` 恢复也行，见第 3 节）。

## 2. 同步到自己的 GitHub 仓库

这份目录本身就是完整 clone（含上游全部历史），最省事：

```bash
git checkout v0.6.2-carwith
git remote rename origin upstream
git remote add origin https://github.com/<你>/<仓库名>.git
git push -u origin v0.6.2-carwith   # 需要时再 push master/main 或打 tag
```

想从 upstream 现拉、只贴补丁（CI / 另一台机器）：

```bash
git clone https://github.com/maotoumao/MusicFree && cd MusicFree
git checkout f82436a7                                   # 本次基线
git checkout -b v0.6.2-carwith
git am --keep-cr /path/to/0001-*.patch /path/to/0002-*.patch ...   # ★ 必须带 --keep-cr
```

补丁系列随时可以从这个分支重导：`git format-patch f82436a7..v0.6.2-carwith`。

★ **`--keep-cr` 不是可选项**（这次实测撞到的）：`android/app/build.gradle`、`MainApplication.kt`、
`basicSetting.tsx`、`themeSetting/mode.tsx`、`src/types/core/config.d.ts` 这五个文件在上游仓库里
是 **CRLF** 行尾，而 `git am` 默认会把补丁上下文行尾的 `\r` 当邮件格式吃掉，于是第一个补丁
就报 `error: android/app/build.gradle: patch does not apply`。加 `--keep-cr` 六个补丁全部干净落地
验证方法：`git am --keep-cr` 跑完后比 `git rev-parse <原分支>^{tree}` 和
`git rev-parse <新分支>^{tree}`，两个 tree hash 相同才算真的等价（实测相同）。
`git apply` / `git checkout` 不带这个坑，只有 `git am` 有。

以后上游发新版：`git fetch upstream && git rebase <新基线> v0.6.2-carwith`，
冲突点必然落在这 16 个文件里，按第 5 节处理。

## 3. 构建出同一个 APK

```bash
npm install                      # 或 yarn；RNTP 必须是 4.1.1
node carwith/tools/apply-rntp-carwith.js        # 落地 B 部分（幂等，再跑是 SKIP）
cd android
JAVA_HOME=<JDK17> gradle assembleRelease  # Windows: .\gradlew.bat assembleRelease
# 产物 app/build/outputs/apk/release/app-arm64-v8a-release.apk
python3 ../carwith/tools/check_apk.py app/build/outputs/apk/release/app-arm64-v8a-release.apk
# 期望最后一行 ALL PASS，九组断言全绿
```

想改用 patch-package：`npm i -D patch-package && npx patch-package`（它认根目录 `patches/` 的
命名），行为与这个脚本等价。工具链硬要求（JDK 17 必须是 daemon 本身、aliyun 镜像、ABI/签名档）见《重做说明》二、三、四。
`carwith/tools/check_apk.ps1` 是同一套断言的 PowerShell 移植。

## 4. 自检（证明这份源码等于那个 APK）

```bash
# 4.1 依赖补丁可复现
rm -rf node_modules/react-native-track-player && npm install react-native-track-player@4.1.1  # 或整包重装
node carwith/tools/apply-rntp-carwith.js
node carwith/tools/apply-rntp-carwith.js            # 第二次必须 SKIP
node carwith/tools/apply-rntp-carwith.js --check    # 只读校验

# 4.2 构建产物可复现
python carwith/tools/check_apk.py <apk>             # ALL PASS
for n in classes.dex classes2.dex classes3.dex assets/index.android.bundle; do
  echo -n "$n  "; unzip -p <apk> $n | sha256sum; done   # 对第 0 节表里那两个 sha
```

## 5. 上游漂移了怎么办

按出现频率从高到低：

1. **`git am` / `git apply` 冲突**（A 部分）：冲突文件就是那 16 个；每处改动的**语义**
   （要贴在哪条调用/哪个函数的什么位置、为什么必须是那里）在《重做说明》一、功能 与
   五、改动清单 里逐条写着，照语义重新定位即可，别照行号硬搬。
2. **`carwith/tools/apply-rntp-carwith.js` 报 `FAIL 解析到的是 x.y.z`**：说明 RNTP 升了。两条路 ——
   钉回 4.1.1（保交付一致性），或对新版本重做补丁：把新包解出来，按 `patches/` 里那份
   diff 的 5 个 hunk 逐一挪位置，重新生成 `<pkg>+<ver>.patch` 并更新脚本里
   `EXPECT_VERSION` / 三个 `pristine` / `patched` sha256。
3. **`FAIL 文件既不是基线也不是已打状态`**：`node_modules` 被动过（别的补丁、手改、
   或缓存里那个包不是 npm 上的 4.1.1）。`rm -rf node_modules && npm install` 再跑。
4. **RNTP 侧语义变了**（要读代码判断，脚本查不出来）：
   - `MusicService` 里还能不能拿到 `player.notificationManager.getMediaMetadataCompat()`；
   - 上游那个 `mediaSessionConnector.setMediaMetadataProvider {}` 是否仍在
     `BaseAudioPlayer` init 的 coroutine 里设（`installProvider()` 的「记账前置」就是围着它设计的）；
   - `setMetadataDeduplicationEnabled(true)` 还在不在（关了的话逐句重发不必再绕 provider）。
   这三条任一变了，照《重做说明》四、构建 末尾「运行期踩坑登记 8)」重新核一遍，
   那一条就是「在 provider 回调里装 provider ⇒ StackOverflowError ⇒ 开关没勾也闪退」的实证记录。
5. **车机侧契约变了**（与上游无关，CarWith 升级才会）：`ucar.media.metadata.LYRICS_*` 键名、
   `Settings.Global.ucar_night_mode`、连接判据（虚拟屏名 + `Display.getType()==5`）、
   `MAX_WHOLE_CHARS` —— 全部集中在 `CarWithLyric.kt` 顶部与 `CarWithState.kt` 的枚举函数里。

## 6. 许可与签名注意

- MusicFree 是 **AGPL-3.0**：把改后的 App 分发给别人（含车机上装）就要能拿到对应源码；
  这个分支 + `patches/` 即为对应源码，随包附上即可，别只发 APK。
- RNTP 是 **Apache-2.0**，`patches/react-native-track-player+4.1.1.patch` 属其修改衍生，
  保留了上游 `LICENSE`，改动以补丁形式隔离、未把上游源码复制进本仓库。
- 签名用的是上游仓库自带的 `android/app/debug.keystore`（公签，方便复现）。
  **正式分发请换成自己的 keystore**：不同签名的包和官方 MusicFree 不能共存，装之前要先卸载。

## 7. 已知边界（不装真车给不出的答案）

车机侧行为全部来自前四份文档（真车实测）与 CarWith 反汇编，本次验证做到
「编译通过 + 九组 APK 断言 ALL PASS + 源码级逐条对照契约 + 本地装车播放不闪退」为止；
真车上的歌词跟随 / 熄屏深浅色跟随 / 断连重连三条仍待复验，清单见《重做说明》九。
