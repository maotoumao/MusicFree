---
name: i18n-conventions
description: 'MusicFree i18n（国际化）命名与组织规范。动任何 i18n 相关工作前必读：新增/修改界面文案、命名 translation key、选 namespace、写 locale 文件（zh-CN/zh-TW/en-US）、用 t() 或 <Trans>、无障碍 a11y 文案、弹窗/面板（panel/dialog）文案归属、富文本插值 <a>。Use when adding or naming i18n strings, translation keys, namespaces, locales, t()/Trans, accessibility labels, or dialog/panel copy in MusicFree. 触发词：i18n、国际化、文案、翻译、locale、t()、Trans、翻译 key、多语言。'
---

# MusicFree i18n 命名与组织规范

`i18n/` 是**独立叶子层**（同 `design/`），被所有 UI 直接 import，**不入 `core`、不走 DI**。
语言选择态的持久化归 `core/config`（boot 读持久化 → 调 `i18n.setLocale`）；i18n 层自身保持纯净。

## 何时用本 skill

- 新增/修改任何界面文案，或给文案命 key
- 选文案该放哪个 namespace
- 写/改 `locales/{zh-CN,zh-TW,en-US}.json`
- 用 `t()` 或 `<Trans>`；写 a11y 无障碍文案
- 处理弹窗/面板（dialog/panel）的文案归属

## 机制（自研 typed t()，非 i18next）

```
i18n/
  locales/  zh-CN.json（源，定义 key 形状）· zh-TW.json · en-US.json
  index.ts  t() · <Trans> · useT() · localeAtom(jotai) · setLocale() · SUPPORTED_LOCALES
```

- **两个入口**：
  - `t(key, params?): string` —— 纯文本，只处理 `{name}` 插值。覆盖绝大多数场景
  - `<Trans>` —— 处理 `{name}` + **单层** `<tag>…</tag>`，标签渲染函数由调用方传（i18n 层不 import 任何 UI 组件）
- **响应式**：`localeAtom`（jotai 默认 store，**无 Provider**）；`useT()` 订阅它。默认 `zh-CN`
- **完备性由 tsc 兜**：`zh-CN` 是源、定义 key 形状；`zh-TW`/`en-US` 声明为同一 `Translations` 类型，**缺任何 key 编译报错**。运行时缺失回退 `zh-CN`

## 存储：嵌套 + 递归 Paths 类型

- locale 文件用**嵌套对象**（按域成块，可读），**不用**扁平点分墙
- `type TranslationKey = Paths<typeof zhCN>`（递归路径类型）给 `t()` 精确 key 补全
- 调用点仍是点分路径字符串：`t('media.quality.high')`、`t('common.cancel')`

## 命名空间分类法（核心）

**命名空间 = 拥有该串的 UI 单元**；只有三类是跨切面的共享域：

| namespace | 归谁 |
|---|---|
| `common` | 通用**标签/动词**（cancel/confirm/save/delete/loading…），到处用 |
| `media` | 音乐领域词汇（媒体类型/音质/循环模式/未知歌手/字段名），跨屏复用 |
| `feedback` | 通用、**渠道无关**的**状态/结果消息**（networkError/unknownError/loadFailed/saved/copied/deleted…），跨 feature 复用 |
| `<feature>` | 每个**页面**按其**路由名**（`home`/`search`/`setting`/`pluginManager`/`localMusic`/`download`/`musicDetail`/`playlistDetail`/`history`/`topList`…） |
| `<widget>` | 跨页共享 **widget** 按其名（`musicBar`/`musicRow`/`mediaList`…）——widget 跨页，塞不进单一页面 |
| `<overlay>` | 业务 overlay（`widgets/overlays/*`）按其名（`subscribePluginDialog`/`createPlaylistDialog`/`addToPlaylistPanel`…） |

### `common` vs `feedback` 边界

- `common` = 可复用的**短标签/动词**（按钮/菜单项文字）；`feedback` = 可复用的**状态句**（操作结果、错误、成功）。别混。
- `feedback` 命名**不绑渠道**（同一句可能 toast / dialog / inline 显示），故不叫 `toast`。
- **防第三个大杂烩桶**：只有**真正通用且被 2+ feature 复用**的消息进 `feedback`；**feature 专属反馈仍归 feature**（`pluginManager.installFailed`、`playlistDetail.created` 不进 `feedback`）。
- **引导性提示（hint）不设共享域**——空状态/占位/操作前提示是 widget 或 feature 自有（`empty` widget、`search` 占位…）。

### 弹窗/面板（panel/dialog）—— 无 catch-all

- **业务 overlay** → 各自一个 namespace，按 overlay 名（同 widget 待遇）
- **通用壳**（`components/overlay` 的 Dialog/Panel/Confirm）→ **不拥有任何串**：按钮走 `common.confirm/cancel`；标题/正文由**唤起它的 feature** 用自己的 namespace 传入（含插值）
- **禁**建 `dialog`/`panel`/`modal` 大杂烩 namespace。例：「确认删除歌单《{name}》吗」归 `playlistDetail`（谁唤起谁拥有），不归某弹窗桶

## key 命名铁律

1. **camelCase 叶子 key**（对齐代码库；不用 snake_case）
2. **嵌套对象分组**，不用前缀塞 key：`media.type.music` / `media.quality.high` / `setting.playback.xxx`，**不是** `media_type_music`
3. **key 说「含义」不说「UI 位置/英文词」**：`home.clickToSearch`（说什么）而非 `home.searchBarText`（在哪）
4. **无障碍串放 `<ns>.a11y.*`**：`home.a11y.openSidebar`
5. **插值 `{name}`** 单花括号（不用 `{{}}`）
6. **含 `<tag>` 的 key 只能经 `<Trans>` 用**，纯文本走 `t()`；标签只支持**单层**（`<a>…</a>`、`<highlight>{method}</highlight>`）

## locale 码

- `zh-CN` / `zh-TW` / `en-US`（BCP-47，大写地区码）。文件 `locales/<code>.json`
- **源语言 = `zh-CN`**（中文优先），定义 key 形状；其余 locale 结构对齐它

## 复数（plural）

- **存储 = CLDR 类目对象**（不是字符串）：
  ```json
  // zh-CN（中文只有 other）
  "media": { "songCount": { "other": "{count} 首" } }
  // en-US（英文 one + other）
  "media": { "songCount": { "one": "{count} song", "other": "{count} songs" } }
  ```
- **调用不变**：`t('media.songCount', { count: n })`。t() 解析出的节点是**对象**（复数节点）就选类目 → 选模板 → 插值（`count` 自动注入）；是**字符串**就普通插值。消歧靠「节点是 string 还是 object」，不靠 key 命名。
- **选择器 = 二元** `n === 1 ? 'one' : 'other'`（设备端 Hermes **无 `Intl.PluralRules`**；二元对 zh/en/zh-TW 正确）。将来加 ru/ar 这类多类目语言，再上 polyfill 或 CLDR 规则表——**存储已是 CLDR 类目、调用点不变，届时只换选择器**。
- **完备性**：所有 locale 必须有 `other`，`one` 可选（中文不写）。类型上「子项全是 CLDR 类目字符串」的节点当**复数叶子**（`t()` 强制要 `{count}`），不当 namespace。

## 新增一条文案（步骤）

1. **定 namespace**：先判断——通用标签/动词？→ `common`。领域词汇？→ `media`。通用状态/结果消息（且 2+ feature 复用）？→ `feedback`。否则归**拥有它的 UI 单元**（页=路由名 / widget=名 / overlay=名）
2. **命 key**：camelCase、说含义、必要时嵌套分组；a11y 串放 `<ns>.a11y.*`
3. **写 `zh-CN.json`**（源），再补 `zh-TW.json` / `en-US.json`——三者结构必须一致（否则 tsc 报错）
4. **调用**：纯文本 `t('ns.key')` / 带参 `t('ns.key', { name })` / 富文本 `<Trans k="ns.key" values={} tags={{ a: c => <TextLink…>{c}</TextLink> }} />`

## 新增一种语言

在 `locales/` 加 `<code>.json`（结构对齐 `zh-CN`）→ 补进 `Locale` 类型 → 在 `SUPPORTED_LOCALES` 注册 → 在 `LOCALE_NAMES` 补该语言的自称（语言选择器直接展示，不翻译）→ 在 `core/config` 的 `configRules['app.language']` 放行该 locale（否则选了存得下、重启却恢复不了）。缺 key 与缺自称由 tsc 逮，漏放行由 `core/config` 的值域用例逮；`SUPPORTED_LOCALES` 得自己记着补（它决定选择器列出哪些语言）。

## 禁忌（常见错误 → 正确做法）

- ❌ snake_case key（`media_type_music`）→ ✅ camelCase 嵌套（`media.type.music`）
- ❌ 页面 namespace 加 `_page`/`_view` 之类后缀（且时有时无）→ ✅ 直接用 feature 路由名，无后缀
- ❌ `dialog`/`panel`/`modal` 大杂烩桶 → ✅ 按 overlay 名各自 namespace，通用壳不持串
- ❌ 扁平点分单层大 JSON（`"a.b.c": "…"`）→ ✅ 嵌套对象
- ❌ `{{var}}` 双花括号插值 → ✅ 单花括号 `{name}`
- ❌ key 反映 UI 位置（`searchBarText`）→ ✅ 反映含义（`clickToSearch`）

## wire / 冻结轴

locale 文件里的 **key 路径**一旦被代码引用即是内部契约，**改名要同步所有调用点 + 三个 locale**；不要随手改。文案值（翻译文本）可自由改。
