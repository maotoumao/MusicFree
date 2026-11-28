/**
 * 配置项 schema：扁平点分 key → 值类型
 * key 名与 JSON 序列化是持久化 wire 契约（沿用 legacy `App.config` store），冻结不可改
 * 各 key 由其归属功能轮按需新增；legacy 键沿用其冻结点分名，新键自首次发布起同样冻结
 */
import {
    integerInRange,
    isBoolean,
    isFiniteNumber,
    isNonEmptyString,
    isRecord,
    isString,
    numberInRange,
    oneOf,
    stringMatching,
} from '@/utils/guards';
import { isQualityKey } from '@/utils/media';

import type { Locale } from '@/i18n';
import type { FloatingLyricMode, QualityKey } from '@/types';

export interface ConfigSchema {
    /** 界面语言；未设 = 跟随 i18n 默认（zh-CN） */
    'app.language': Locale;
    /** 插件订阅源列表（干净数组存储；读时兼容 legacy 双重编码字符串，见 core/plugin getSubscriptions） */
    'plugin.subscribeUrl': { name: string; url: string }[];
    /** 允许旧版本插件覆盖新版本插件（关 = 已装版本更新时拒装）；legacy 冻结键，其原意即此 */
    'basic.notCheckPluginVersion': boolean;
    /** 忽略插件声明的 appVersion 范围：与当前 App 不匹配时仍安装并启用 */
    'plugin.ignoreAppVersion': boolean;
    /** 启动时自动更新已装插件 */
    'basic.autoUpdatePlugin': boolean;
    /** 播放：使用移动网络播放（关则流量下拦截联网播放）；legacy 拼写 Celluar 冻结 */
    'basic.useCelluarNetworkPlay': boolean;
    /** 播放：App 启动时自动续播上次曲目 */
    'basic.autoPlayWhenAppStart': boolean;
    'basic.notInterrupt': boolean;
    /** 播放：播放失败时自动停止（关则自动跳下一首） */
    'basic.autoStopWhenError': boolean;
    /** 播放：默认播放音质 */
    'basic.defaultPlayQuality': QualityKey;
    /** 播放：默认音质缺失时的回退方向（asc=往更高、desc=往更低） */
    'basic.playQualityOrder': 'asc' | 'desc';
    /** 播放：播放失败时尝试更换音源（跨插件找相似歌） */
    'basic.tryChangeSourceWhenPlayFail': boolean;
    /** 播放：音频缓存上限（字节；= 边下边播缓存） */
    'basic.maxCacheSize': number;
    /** 历史：最近播放记录上限（条，1–1000） */
    'basic.maxHistoryLen': number;
    /** Local playlist：新建歌单的默认曲目排序；值域与 core/playlist 的 PlaylistMusicSortMode 同源 */
    'playlist.defaultMusicSortMode':
        | 'manual'
        | 'title'
        | 'titleDesc'
        | 'artist'
        | 'artistDesc'
        | 'album'
        | 'albumDesc'
        | 'addedAt'
        | 'addedAtDesc';
    /** 搜索：点单曲的行为——playMusic=仅播放该曲；playMusicAndReplace=用当前来源结果替换队列并播放（legacy wire 冻结） */
    'basic.clickMusicInSearch': 'playMusic' | 'playMusicAndReplace';
    /** 界面：停留在正在播放页时保持屏幕常亮 */
    'basic.musicDetailAwake': boolean;
    /** 正在播放页：每次进入时先显示哪一屏 */
    'musicDetail.defaultView': 'cover' | 'lyric';

    // —— 下载 ——
    /** 下载：最大并发下载数（1–5） */
    'basic.maxDownload': number;
    /** 下载：一条完成后到下一条开始的冷却毫秒（0=无冷却） */
    'basic.downloadInterval': number;
    /** 下载：默认下载音质（独立于播放音质） */
    'basic.defaultDownloadQuality': QualityKey;
    /** 下载：默认音质缺失时的回退方向（asc=往更高、desc=往更低） */
    'basic.downloadQualityOrder': 'asc' | 'desc';
    /** 下载：使用移动网络下载（关则仅 Wi-Fi，移动网络下暂停等 Wi-Fi）；对齐 useCelluarNetworkPlay 的冻结拼写 Celluar */
    'basic.useCelluarNetworkDownload': boolean;
    /**
     * 下载：落盘目录绝对路径；空串 = app 私有默认目录（`infra/paths` 的 defaultDownloadDir）
     * 设备本地事实（换机后路径未必存在），故**不进备份白名单**
     * 有效目录由 `core/download` 解析（resolveDownloadDir），别在别处自己拼
     */
    'basic.downloadPath': string;

    // —— 歌词 ——
    /** 当前歌曲所属插件无歌词时，自动从其它已启用插件搜索 */
    'lyric.autoSearchLyric': boolean;
    /** 歌词画布字号档位：small=16 / standard=18 / large=22 / xlarge=28（dp） */
    'lyric.fontSize': 'small' | 'standard' | 'large' | 'xlarge';
    /** 显示译文；歌词画布与悬浮歌词共用同一真相，由歌词工具行的「翻译」写入 */
    'lyric.showTranslation': boolean;

    // —— 悬浮歌词（Android 悬浮窗）——
    // 两种形态互斥单选：桌面歌词卡（可交互）与状态栏条（纯展示）
    // 形态无关项留在 floatingLyric.*，形态私有项进 floatingLyric.<mode>.*（值域与默认值按形态各不相同）
    /** 总开关；持久化，重启后按此 + 悬浮窗权限恢复显示 */
    'floatingLyric.enabled': boolean;
    /** 当前呈现形态 */
    'floatingLyric.mode': FloatingLyricMode;
    /** 文字色：`#RRGGBB` 或 `#RRGGBBAA`（CSS 顺序，colord 序列化）；原生桥转 Android ARGB。两形态共用，属用户偏好非主题 token */
    'floatingLyric.textColor': string;
    /** 桌面歌词卡：字号 sp（取自 core 的档位表 14–24） */
    'floatingLyric.desktop.fontSize': number;
    /** 桌面歌词卡：底色浓度 0–0.9（黑底；仅未锁定且刚操作过时绘制，静置即淡出） */
    'floatingLyric.desktop.backgroundOpacity': number;
    /** 桌面歌词卡：归一化纵向锚点 0–1（按安全区内的可移动范围）；拖动松手写入 */
    'floatingLyric.desktop.positionY': number;
    /** 桌面歌词卡：锁定态，完全点击穿透、只展示不响应 */
    'floatingLyric.desktop.locked': boolean;
    /** 状态栏条：字号 sp（取自 core 的档位表 12–18） */
    'floatingLyric.statusBar.fontSize': number;
    /** 状态栏条：底色浓度 0–0.9（黑底，跟随文字宽度不铺满）；默认 0 = 纯文字 */
    'floatingLyric.statusBar.backgroundOpacity': number;
    /** 状态栏条：归一化纵向锚点 0–1；此形态不可拖，由设置面板写入 */
    'floatingLyric.statusBar.positionY': number;

    // —— 音效 / 均衡器（Android 系统 EQ；原生不持久，启动后由 core/audioEffect 重放）——
    /** 均衡器开关；关 = 旁路（增益保留） */
    'audioEffect.eqEnabled': boolean;
    /** 各频段增益（millibel，按频段序号顺序）；重放真相源。段数由设备定，不匹配则回落拉平 */
    'audioEffect.eqGains': number[];
    /** 选中的系统预设英文原名；缺省（未设）= 自定义（手动调过增益） */
    'audioEffect.eqPreset': string;
    /** 自定义槽：套预设前快照的自定义曲线；切回自定义时恢复，缺省 / 段数不符则全 0 */
    'audioEffect.eqCustomGains': number[];

    // —— 定时关闭（倒计时本身不持久化：进程没了播放也没了，恢复反而是惊吓）——
    /** 到点时若正在播歌，等它放完再停（默认开） */
    'sleepTimer.waitForCurrentEnd': boolean;
    /** 上次自定义时长（分钟，1–720）；自定义输入的预填值 */
    'sleepTimer.lastCustomMinutes': number;

    // —— WebDAV 备份（键名沿用 legacy，升级用户设置直接对上）——
    // 凭据不入备份文件（协议约定），故这三项永不进 core/backup 的 settings 白名单
    /** 服务器地址，含 scheme 与可选子路径 */
    'webdav.url': string;
    'webdav.username': string;
    'webdav.password': string;
}

export type ConfigKey = keyof ConfigSchema;

/** 配置端口：UX / 其他 core 经此读写（DI 注入 IConfig） */
export interface IConfig {
    /** 读配置；未设时回中央默认（configDefaults），仍无则 undefined */
    get<K extends ConfigKey>(key: K): ConfigSchema[K] | undefined;
    /** 读原始持久值，不回落默认；未设即 undefined（用于判定用户是否显式设过该项） */
    getStored<K extends ConfigKey>(key: K): ConfigSchema[K] | undefined;
    /** 写配置；value 为 undefined 时清除该项 */
    set<K extends ConfigKey>(key: K, value?: ConfigSchema[K]): void;
    /**
     * 值是否落在该 key 的值域（枚举 / 范围 / 格式）
     * 供备份恢复等**不可信输入**在写入前自检；set 本身不做校验，既有调用方行为不变
     */
    isValid<K extends ConfigKey>(
        key: K,
        value: unknown,
    ): value is ConfigSchema[K];
    /** 订阅指定 key 的变更（只通知、不回放当前值），返回退订；供非 React 的 core 用 */
    subscribe(keys: readonly ConfigKey[], cb: () => void): () => void;
}

/**
 * 中央默认表：未显式设置时的回退值（单一真相源，取代散落的 ?? 默认）
 * 无合理默认的项（如 plugin.subscribeUrl）不列，读时回 undefined
 */
export const configDefaults: Partial<ConfigSchema> = {
    'basic.autoUpdatePlugin': false,
    'basic.notCheckPluginVersion': false,
    'plugin.ignoreAppVersion': false,
    'basic.useCelluarNetworkPlay': false,
    'basic.autoPlayWhenAppStart': false,
    'basic.notInterrupt': false,
    'basic.autoStopWhenError': false,
    'basic.defaultPlayQuality': 'standard',
    'basic.playQualityOrder': 'asc',
    'basic.tryChangeSourceWhenPlayFail': false,
    'basic.maxCacheSize': 512 * 1024 * 1024,
    'basic.maxHistoryLen': 50,
    /** 歌单默认按加入时间倒序：第一首=最近加入、封面随之 */
    'playlist.defaultMusicSortMode': 'addedAtDesc',
    'basic.clickMusicInSearch': 'playMusic',
    'basic.musicDetailAwake': false,
    'musicDetail.defaultView': 'cover',
    'basic.maxDownload': 3,
    'basic.downloadInterval': 0,
    'basic.defaultDownloadQuality': 'standard',
    'basic.downloadQualityOrder': 'asc',
    'basic.useCelluarNetworkDownload': false,
    'basic.downloadPath': '',
    'lyric.autoSearchLyric': false,
    'lyric.fontSize': 'standard',
    'lyric.showTranslation': false,
    'floatingLyric.enabled': false,
    'floatingLyric.mode': 'desktop',
    'floatingLyric.textColor': '#FFFFFF',
    'floatingLyric.desktop.fontSize': 18,
    'floatingLyric.desktop.backgroundOpacity': 0.55,
    // 可移动范围（安全区高 − 卡片高）的 18%：上半屏靠上，避开状态栏与底部手势区
    'floatingLyric.desktop.positionY': 0.18,
    'floatingLyric.desktop.locked': false,
    'floatingLyric.statusBar.fontSize': 14,
    'floatingLyric.statusBar.backgroundOpacity': 0,
    'floatingLyric.statusBar.positionY': 0,
    // audioEffect.eqEnabled 默认关；eqGains/eqPreset 不列默认 → 读回 undefined，setup 按设备段数拉平并落库
    'audioEffect.eqEnabled': false,
    // 睡眠场景里几分钟误差无代价、被切醒有，故默认不中断歌曲
    // lastCustomMinutes 不列默认 → 未用过自定义时读回 undefined，面板不显示「上次」
    'sleepTimer.waitForCurrentEnd': true,
};

/** 0–1 比例的归一化坐标 */
const isUnitInterval = numberInRange(0, 1);

/**
 * 各 key 的值域规则：判定一个不可信来源的值能否落库
 * 与 configDefaults 同为 schema 元知识，故并列于此；消费方经 IConfig.isValid 调用
 * 末尾 satisfies 保证**每个 key 都有规则**，并挡住比 ConfigSchema 更宽的谓词；
 * 但它管不了「谓词比类型更窄」（如只认 'asc' 会漏掉 'desc'）与具体数值区间——那些由单元测试锁定
 */
export const configRules = {
    'app.language': oneOf('zh-CN', 'zh-TW', 'en-US'),
    'plugin.subscribeUrl': (
        value: unknown,
    ): value is ConfigSchema['plugin.subscribeUrl'] =>
        Array.isArray(value) &&
        value.every(
            item =>
                isRecord(item) &&
                typeof item.name === 'string' &&
                typeof item.url === 'string',
        ),
    'basic.autoUpdatePlugin': isBoolean,
    'basic.notCheckPluginVersion': isBoolean,
    'plugin.ignoreAppVersion': isBoolean,
    'basic.useCelluarNetworkPlay': isBoolean,
    'basic.autoPlayWhenAppStart': isBoolean,
    'basic.notInterrupt': isBoolean,
    'basic.autoStopWhenError': isBoolean,
    'basic.defaultPlayQuality': isQualityKey,
    'basic.playQualityOrder': oneOf('asc', 'desc'),
    'basic.tryChangeSourceWhenPlayFail': isBoolean,
    // 沿用 legacy 设置页的产品区间 100MB–8192MB（落库单位为字节）
    'basic.maxCacheSize': integerInRange(100 * 1024 * 1024, 8192 * 1024 * 1024),
    // legacy 选项最大 500，此处放宽上限、只挡会撑爆内存的量级
    'basic.maxHistoryLen': integerInRange(1, 1000),
    'playlist.defaultMusicSortMode': oneOf(
        'manual',
        'title',
        'titleDesc',
        'artist',
        'artistDesc',
        'album',
        'albumDesc',
        'addedAt',
        'addedAtDesc',
    ),
    'basic.clickMusicInSearch': oneOf('playMusic', 'playMusicAndReplace'),
    'basic.musicDetailAwake': isBoolean,
    'musicDetail.defaultView': oneOf('cover', 'lyric'),
    'basic.maxDownload': integerInRange(1, 5),
    'basic.downloadInterval': integerInRange(0, 60_000),
    'basic.defaultDownloadQuality': isQualityKey,
    'basic.downloadQualityOrder': oneOf('asc', 'desc'),
    'basic.useCelluarNetworkDownload': isBoolean,
    // 空串（用默认目录）或绝对路径。这里只挡明显不成形的值：形态的最终判据是
    // core/download 的 isUsableDownloadDir（写入侧一律经 normalizeDownloadDir，
    // 读出侧非法即回退默认目录），存在性与可写性要碰盘、由落地前的探针管
    'basic.downloadPath': stringMatching(/^(\/.+)?$/),
    'lyric.autoSearchLyric': isBoolean,
    'lyric.fontSize': oneOf('small', 'standard', 'large', 'xlarge'),
    'lyric.showTranslation': isBoolean,
    'floatingLyric.enabled': isBoolean,
    'floatingLyric.mode': oneOf('desktop', 'statusBar'),
    'floatingLyric.textColor': stringMatching(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i),
    // 值域比档位表宽：档位是 UI 的取值手段，能正常渲染的范围由此把关（原生另有 clamp）
    'floatingLyric.desktop.fontSize': numberInRange(12, 24),
    'floatingLyric.desktop.backgroundOpacity': numberInRange(0, 0.9),
    'floatingLyric.desktop.positionY': isUnitInterval,
    'floatingLyric.desktop.locked': isBoolean,
    'floatingLyric.statusBar.fontSize': numberInRange(12, 18),
    'floatingLyric.statusBar.backgroundOpacity': numberInRange(0, 0.9),
    'floatingLyric.statusBar.positionY': isUnitInterval,
    'audioEffect.eqEnabled': isBoolean,
    'audioEffect.eqGains': (
        value: unknown,
    ): value is ConfigSchema['audioEffect.eqGains'] =>
        Array.isArray(value) && value.every(isFiniteNumber),
    'audioEffect.eqPreset': isNonEmptyString,
    'audioEffect.eqCustomGains': (
        value: unknown,
    ): value is ConfigSchema['audioEffect.eqCustomGains'] =>
        Array.isArray(value) && value.every(isFiniteNumber),
    'sleepTimer.waitForCurrentEnd': isBoolean,
    'sleepTimer.lastCustomMinutes': (
        value: unknown,
    ): value is ConfigSchema['sleepTimer.lastCustomMinutes'] =>
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 1 &&
        value <= 720,
    // 凭据只求「是字符串」：URL 形态由连接时的真实请求判定，用户名密码本就无从校验
    'webdav.url': isNonEmptyString,
    'webdav.username': isString,
    'webdav.password': isString,
} satisfies {
    [K in ConfigKey]: (value: unknown) => value is ConfigSchema[K];
};
