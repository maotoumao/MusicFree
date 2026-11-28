import { v4 as uuidv4 } from 'uuid';

import {
    getObject,
    getOrCreateMMKV,
    getStoreVersion,
    setObject,
    setStoreVersion,
} from '@/infra/storage';

import {
    cleanupBackgroundImages,
    isSafeBackgroundImageFileName,
    persistBackgroundBitmap,
    persistBackgroundSource,
    removeBackgroundImage,
    resolveBackgroundImageUri,
    scanBackgroundImages,
} from './backgroundStore';

import type {
    ITheme,
    ThemeBackground,
    ThemeBackgroundBake,
    ThemeColorOverrides,
    ThemeColorRole,
    ThemeColorScheme,
    ThemePack,
    ThemePreferences,
    ThemeSelection,
} from './types';

interface StoredThemeBackgroundV2 {
    readonly fileName: string;
    readonly sourceFileName: string;
    readonly blurRadius: number;
    readonly focusX: number;
    readonly focusY: number;
    readonly scale: number;
    readonly averageColor: string;
    readonly visibility: number;
    readonly surfaceOpacity: number;
}

interface StoredThemePackV2 {
    readonly id: string;
    readonly name: string;
    readonly scheme: ThemeColorScheme;
    readonly colors: Record<string, string>;
    readonly background: StoredThemeBackgroundV2 | null;
    readonly autoContrast: boolean;
}

interface StoredThemePreferencesV2 {
    readonly packs: readonly StoredThemePackV2[];
    readonly selection: ThemeSelection;
}

/** App 主题 MMKV store；id 与 key 均是持久化契约 */
const themeStore = getOrCreateMMKV('App.theme');
const PREFERENCES_KEY = 'preferences';
const STORAGE_VERSION = 2;
/** v1 = alpha 期的「单背景 + 逐角色补丁」形状，已整体重构；不迁移、直接作废 */
const DISCARDED_STORAGE_VERSION = 1;

const BUILTIN_LIGHT_PACK_ID = 'builtin.light';
const BUILTIN_DARK_PACK_ID = 'builtin.dark';

const THEME_BACKGROUND_BLUR_MIN = 0;
const THEME_BACKGROUND_BLUR_MAX = 60;
const THEME_BACKGROUND_BLUR_DEFAULT = 12;
const THEME_BACKGROUND_VISIBILITY_DEFAULT = 0.45;
const THEME_BACKGROUND_SURFACE_OPACITY_DEFAULT = 0.8;
const THEME_BACKGROUND_SCALE_MIN = 1;
/** 平均色缺失时的中性回退：不偏向明暗任一侧 */
const THEME_BACKGROUND_AVERAGE_COLOR_FALLBACK = '#808080';
const THEME_BACKGROUND_SCALE_MAX = 8;

const THEME_PACK_NAME_MAX_LENGTH = 24;
const THEME_PACK_MAX_COUNT = 20;

/** 可被用户覆盖的语义色角色全集；命令与存储都据此校验 */
const THEME_COLOR_ROLES: readonly ThemeColorRole[] = [
    'background',
    'surface',
    'surfaceVariant',
    'text',
    'textSecondary',
    'textDisabled',
    'primary',
    'border',
    'danger',
    'success',
    'warning',
    'info',
    'onPrimary',
    'primarySoft',
    'onPrimarySoft',
    'onDanger',
    'onSuccess',
    'onWarning',
    'onInfo',
    'warningSoft',
    'mask',
    'shadow',
    'ripple',
    'knob',
    'coverAccent',
    'coverAccentStrong',
];
const THEME_COLOR_ROLE_SET: ReadonlySet<string> = new Set(THEME_COLOR_ROLES);

/**
 * 只接受不透明色的角色：页面底是整个合成链的**基准面**
 *
 * 它既是壁纸上的幕布色、又是 `substrateColorAtom` 混出实际基底的一端；半透明会让
 * 「用户到底看到什么颜色」失去参照，明暗判向与对比度体检一起失准。其余角色都是叠在它之上
 * 的东西，半透明是正当选择——卡片尤其需要，那正是自定义背景下不想让它糊成一块的原因。
 */
const THEME_OPAQUE_COLOR_ROLES: ReadonlySet<ThemeColorRole> =
    new Set<ThemeColorRole>(['background']);

/**
 * 内置主题包：代码常量、只读、不入库
 * name 留空——显示名由 UI 按 id 取 i18n 文案（i18n 是叶子层、不入 core）
 */
const BUILTIN_THEME_PACKS: readonly ThemePack[] = Object.freeze([
    Object.freeze({
        id: BUILTIN_LIGHT_PACK_ID,
        name: '',
        scheme: 'light' as const,
        colors: Object.freeze({}),
        background: null,
        autoContrast: true,
    }),
    Object.freeze({
        id: BUILTIN_DARK_PACK_ID,
        name: '',
        scheme: 'dark' as const,
        colors: Object.freeze({}),
        background: null,
        autoContrast: true,
    }),
]);

const DEFAULT_PREFERENCES: ThemePreferences = Object.freeze({
    packs: Object.freeze([]),
    selection: Object.freeze({
        kind: 'system' as const,
        dayPackId: BUILTIN_LIGHT_PACK_ID,
        nightPackId: BUILTIN_DARK_PACK_ID,
    }),
});

/** 同一主题 store 的背景文件与偏好操作共用一条队列，跨 Theme 实例也串行 */
let backgroundOperation = Promise.resolve();

/**
 * 已解析偏好的进程内缓存：getPreferences() 每次重解析会产出新引用，
 * 让 useSyncExternalStore 认定「每次渲染都变了」而空转，故必须保持引用稳定
 *
 * 失效挂在 store 自身的变更监听上（而非只在 #commit 里手动置 null）：
 * 这样将来若有本模块之外的写入方（备份恢复、另一个 runtime），缓存同样会跟着失效
 */
let preferencesCache: { version: number; value: ThemePreferences } | null =
    null;
let cacheInvalidationSubscribed = false;

/** 首次读取时挂上失效监听；不在模块加载期挂，避免 import 即产生副作用 */
function subscribeCacheInvalidation(): void {
    if (cacheInvalidationSubscribed) {
        return;
    }
    cacheInvalidationSubscribed = true;
    themeStore.addOnValueChangedListener(() => {
        preferencesCache = null;
    });
}

/** 主题偏好：同步持久化；内存只持有当前已落库的不可变快照 */
class Theme implements ITheme {
    #setupPromise: Promise<void> | null = null;

    constructor() {
        preferencesCache = null;
        const version = getStoreVersion(themeStore);
        if (version === 0 && themeStore.getAllKeys().length === 0) {
            setStoreVersion(themeStore, STORAGE_VERSION);
            return;
        }
        if (version === DISCARDED_STORAGE_VERSION) {
            setObject(themeStore, PREFERENCES_KEY, undefined);
            setStoreVersion(themeStore, STORAGE_VERSION);
        }
    }

    getPreferences(): ThemePreferences {
        return readPreferences();
    }

    setup(): Promise<void> {
        this.#setupPromise ??= enqueueBackgroundOperation(() =>
            this.#reconcileBackgrounds(),
        );
        return this.#setupPromise;
    }

    subscribe(listener: () => void): () => void {
        const subscription = themeStore.addOnValueChangedListener(() => {
            listener();
        });
        return () => subscription.remove();
    }

    selectPack(packId: string): void {
        this.#assertWritable();
        const preferences = this.getPreferences();
        assertPackExists(preferences, packId);
        const { selection } = preferences;
        if (selection.kind === 'fixed' && selection.packId === packId) {
            return;
        }
        this.#commit({ ...preferences, selection: { kind: 'fixed', packId } });
    }

    selectSystemPacks(dayPackId: string, nightPackId: string): void {
        this.#assertWritable();
        const preferences = this.getPreferences();
        assertPackExists(preferences, dayPackId);
        assertPackExists(preferences, nightPackId);
        const { selection } = preferences;
        if (
            selection.kind === 'system' &&
            selection.dayPackId === dayPackId &&
            selection.nightPackId === nightPackId
        ) {
            return;
        }
        this.#commit({
            ...preferences,
            selection: { kind: 'system', dayPackId, nightPackId },
        });
    }

    createPack(sourcePackId: string, name: string): string {
        const packName = normalizeCommandName(name);
        this.#assertWritable();
        const preferences = this.getPreferences();
        const source = resolveThemePack(preferences, sourcePackId);
        if (!source) {
            throw new TypeError(`主题不存在：${String(sourcePackId)}`);
        }
        if (preferences.packs.length >= THEME_PACK_MAX_COUNT) {
            throw new RangeError(`主题数量上限为 ${THEME_PACK_MAX_COUNT}`);
        }
        const id = uuidv4();
        // 背景文件是有主的托管资源，复制主题不共享其引用；新主题从无背景起步
        const created: ThemePack = {
            id,
            name: packName,
            scheme: source.scheme,
            colors: source.colors,
            background: null,
            autoContrast: source.autoContrast,
        };
        this.#commit({
            ...preferences,
            packs: [...preferences.packs, created],
        });
        return id;
    }

    renamePack(packId: string, name: string): void {
        const packName = normalizeCommandName(name);
        this.#updatePack(packId, pack =>
            pack.name === packName ? pack : { ...pack, name: packName },
        );
    }

    async deletePack(packId: string): Promise<void> {
        await enqueueBackgroundOperation(async () => {
            this.#assertWritable();
            const preferences = this.getPreferences();
            const pack = requireUserPack(preferences, packId);
            const fallbackId =
                pack.scheme === 'dark'
                    ? BUILTIN_DARK_PACK_ID
                    : BUILTIN_LIGHT_PACK_ID;
            this.#commit({
                packs: preferences.packs.filter(item => item.id !== packId),
                selection: replaceSelectedPack(
                    preferences.selection,
                    packId,
                    fallbackId,
                ),
            });
            await removeBackgroundFiles(pack.background);
        });
    }

    setPackColor(
        packId: string,
        role: ThemeColorRole,
        color: string | null,
    ): void {
        assertThemeColorRole(role);
        let normalized = normalizeCommandColor(color);
        if (normalized !== null && THEME_OPAQUE_COLOR_ROLES.has(role)) {
            // 与存储侧同一口径：#RRGGBBFF 语义上就是不透明，截断收下；真半透明才拒绝
            normalized = toOpaqueColor(normalized);
            if (normalized === null) {
                throw new TypeError(`${role} 不接受半透明色：${String(color)}`);
            }
        }
        this.#updatePack(packId, pack => {
            if ((pack.colors[role] ?? null) === normalized) {
                return pack;
            }
            const colors: Record<string, string> = { ...pack.colors };
            if (normalized === null) {
                delete colors[role];
            } else {
                colors[role] = normalized;
            }
            return { ...pack, colors };
        });
    }

    resetPackColors(packId: string): void {
        this.#updatePack(packId, pack =>
            Object.keys(pack.colors).length === 0
                ? pack
                : { ...pack, colors: {} },
        );
    }

    setPackAutoContrast(packId: string, enabled: boolean): void {
        if (typeof enabled !== 'boolean') {
            throw new TypeError(`无效的文字自适配开关：${String(enabled)}`);
        }
        this.#updatePack(packId, pack =>
            pack.autoContrast === enabled
                ? pack
                : { ...pack, autoContrast: enabled },
        );
    }

    async setPackBackground(
        packId: string,
        bake: ThemeBackgroundBake,
    ): Promise<void> {
        const shape = normalizeCommandBake(bake);
        await enqueueBackgroundOperation(async () => {
            this.#assertWritable();
            const previous = requireUserPack(
                this.getPreferences(),
                packId,
            ).background;
            if (bake.source.kind === 'keep' && !previous?.sourceFileName) {
                throw new Error('当前主题没有可复用的背景原图');
            }

            // 先落两个文件，再一次性提交偏好；任一步失败都不留下被引用的半成品
            const sourceFileName =
                bake.source.kind === 'pick'
                    ? await persistBackgroundSource(
                          bake.source.uri,
                          bake.source.name,
                      )
                    : previous!.sourceFileName;
            const addedSourceFileName =
                bake.source.kind === 'pick' ? sourceFileName : undefined;
            let fileName: string;
            try {
                fileName = await persistBackgroundBitmap(bake.imageBase64);
            } catch (error) {
                await removeBackgroundFileName(addedSourceFileName);
                throw error;
            }

            try {
                // 队列内重读：烘焙那几百毫秒里图层滑块可能已经改过，图层值一律以当下为准
                const current = this.getPreferences();
                const live = requireUserPack(current, packId).background;
                const next: ThemeBackground = {
                    fileName,
                    sourceFileName,
                    ...shape,
                    visibility:
                        live?.visibility ?? THEME_BACKGROUND_VISIBILITY_DEFAULT,
                    surfaceOpacity:
                        live?.surfaceOpacity ??
                        THEME_BACKGROUND_SURFACE_OPACITY_DEFAULT,
                };
                this.#commit(
                    mapPack(current, packId, pack => ({
                        ...pack,
                        background: next,
                    })),
                );
            } catch (error) {
                await removeBackgroundFileName(fileName);
                await removeBackgroundFileName(addedSourceFileName);
                throw error;
            }

            if (previous) {
                await removeBackgroundFileName(
                    previous.fileName === fileName
                        ? undefined
                        : previous.fileName,
                );
                await removeBackgroundFileName(
                    previous.sourceFileName === sourceFileName
                        ? undefined
                        : previous.sourceFileName,
                );
            }
        });
    }

    setPackBackgroundLayers(
        packId: string,
        visibility: number,
        surfaceOpacity: number,
    ): void {
        const nextVisibility = normalizeCommandRatio(visibility, '背景可见度');
        const nextSurfaceOpacity = normalizeCommandRatio(
            surfaceOpacity,
            '控件不透明度',
        );
        this.#updatePack(packId, pack => {
            const background = pack.background;
            // 背景可能刚被清掉：调用方持有的 React 快照会短暂滞后，静默跳过而不是抛给它
            if (!background) {
                return pack;
            }
            if (
                background.visibility === nextVisibility &&
                background.surfaceOpacity === nextSurfaceOpacity
            ) {
                return pack;
            }
            return {
                ...pack,
                background: {
                    ...background,
                    visibility: nextVisibility,
                    surfaceOpacity: nextSurfaceOpacity,
                },
            };
        });
    }

    async clearPackBackground(packId: string): Promise<void> {
        await enqueueBackgroundOperation(async () => {
            this.#assertWritable();
            const preferences = this.getPreferences();
            const background = requireUserPack(preferences, packId).background;
            if (!background) {
                return;
            }
            this.#commit(
                mapPack(preferences, packId, pack => ({
                    ...pack,
                    background: null,
                })),
            );
            await removeBackgroundFiles(background);
        });
    }

    /**
     * 启动对账：清除指向已丢失位图的背景引用，并回收目录中无主的托管 / 临时文件
     * 只修复文件残留与失效引用，任何失败都不阻断启动
     */
    async #reconcileBackgrounds(): Promise<void> {
        try {
            if (getStoreVersion(themeStore) !== STORAGE_VERSION) {
                return;
            }
            const referenced = collectBackgroundFileNames(
                this.getPreferences(),
            );
            const plan = await scanBackgroundImages(referenced);
            if (!plan.readable) {
                return;
            }
            const isReferenceCurrent = () =>
                getStoreVersion(themeStore) === STORAGE_VERSION &&
                sameFileNames(
                    collectBackgroundFileNames(this.getPreferences()),
                    referenced,
                );
            if (!isReferenceCurrent()) {
                return;
            }

            const missing = new Set(plan.missingFileNames);
            const preferences = this.getPreferences();
            // 只有渲染位图丢失才清背景；原图丢失仅影响重新编辑，不影响显示
            const broken = preferences.packs.filter(
                pack =>
                    pack.background && missing.has(pack.background.fileName),
            );
            let isCleanupCurrent = isReferenceCurrent;
            const staleFileNames = [...plan.staleFileNames];
            if (broken.length > 0) {
                const brokenIds = new Set(broken.map(pack => pack.id));
                this.#commit({
                    ...preferences,
                    packs: preferences.packs.map(pack =>
                        brokenIds.has(pack.id)
                            ? { ...pack, background: null }
                            : pack,
                    ),
                });
                // 被清掉的背景其原图在扫描时还算「被引用」，不在候选里；就地补进去，
                // 否则它要等到下次启动才被回收
                for (const pack of broken) {
                    staleFileNames.push(
                        pack.background!.fileName,
                        pack.background!.sourceFileName,
                    );
                }
                const repaired = collectBackgroundFileNames(
                    this.getPreferences(),
                );
                isCleanupCurrent = () =>
                    getStoreVersion(themeStore) === STORAGE_VERSION &&
                    sameFileNames(
                        collectBackgroundFileNames(this.getPreferences()),
                        repaired,
                    );
            }
            await cleanupBackgroundImages(staleFileNames, isCleanupCurrent);
        } catch {
            // 对账失败不阻断 App 启动
        }
    }

    /** 用户主题的同步字段修改统一入口：读 → 变换 → 无变化则跳过 → 提交 */
    #updatePack(packId: string, update: (pack: ThemePack) => ThemePack): void {
        this.#assertWritable();
        const preferences = this.getPreferences();
        const pack = requireUserPack(preferences, packId);
        const next = update(pack);
        if (next === pack) {
            return;
        }
        this.#commit(mapPack(preferences, packId, () => next));
    }

    #commit(preferences: ThemePreferences): void {
        this.#assertWritable();
        const snapshot = freezePreferences(preferences);
        const stored: StoredThemePreferencesV2 = {
            packs: snapshot.packs.map(pack => ({
                id: pack.id,
                name: pack.name,
                scheme: pack.scheme,
                colors: { ...pack.colors } as Record<string, string>,
                background: pack.background ? { ...pack.background } : null,
                autoContrast: pack.autoContrast,
            })),
            selection: { ...snapshot.selection },
        };
        if (!setObject(themeStore, PREFERENCES_KEY, stored)) {
            throw new Error('主题偏好序列化失败');
        }
        // 写入已被监听回调作废掉缓存，这里把刚提交的快照直接补回去，省掉一次全量重解析
        preferencesCache = {
            version: getStoreVersion(themeStore),
            value: snapshot,
        };
    }

    #assertWritable(): void {
        if (getStoreVersion(themeStore) !== STORAGE_VERSION) {
            throw new Error('当前版本无法修改该主题偏好');
        }
    }
}

/** 裸对象 live-binding，由 app/container 装配 */
let theme: ITheme;

/** 仅 app/container 调用 */
function provideTheme(instance: ITheme): void {
    theme = instance;
}

/** 按 id 解析主题（内置在前，用户其次）；不存在返回 undefined */
function resolveThemePack(
    preferences: ThemePreferences,
    packId: string,
): ThemePack | undefined {
    return (
        BUILTIN_THEME_PACKS.find(pack => pack.id === packId) ??
        preferences.packs.find(pack => pack.id === packId)
    );
}

function isBuiltinThemePackId(packId: string): boolean {
    return BUILTIN_THEME_PACKS.some(pack => pack.id === packId);
}

function requireUserPack(
    preferences: ThemePreferences,
    packId: string,
): ThemePack {
    if (isBuiltinThemePackId(packId)) {
        throw new TypeError(`内置主题不可修改：${String(packId)}`);
    }
    const pack = preferences.packs.find(item => item.id === packId);
    if (!pack) {
        throw new TypeError(`主题不存在：${String(packId)}`);
    }
    return pack;
}

function assertPackExists(preferences: ThemePreferences, packId: string): void {
    if (!resolveThemePack(preferences, packId)) {
        throw new TypeError(`主题不存在：${String(packId)}`);
    }
}

function mapPack(
    preferences: ThemePreferences,
    packId: string,
    update: (pack: ThemePack) => ThemePack,
): ThemePreferences {
    return {
        ...preferences,
        packs: preferences.packs.map(pack =>
            pack.id === packId ? update(pack) : pack,
        ),
    };
}

function replaceSelectedPack(
    selection: ThemeSelection,
    packId: string,
    fallbackId: string,
): ThemeSelection {
    if (selection.kind === 'fixed') {
        return selection.packId === packId
            ? { kind: 'fixed', packId: fallbackId }
            : selection;
    }
    return {
        kind: 'system',
        dayPackId:
            selection.dayPackId === packId ? fallbackId : selection.dayPackId,
        nightPackId:
            selection.nightPackId === packId
                ? fallbackId
                : selection.nightPackId,
    };
}

/** 偏好中被引用的全部背景文件（渲染位图 + 原图） */
function collectBackgroundFileNames(
    preferences: ThemePreferences,
): Set<string> {
    const fileNames = new Set<string>();
    for (const pack of preferences.packs) {
        if (pack.background) {
            fileNames.add(pack.background.fileName);
            fileNames.add(pack.background.sourceFileName);
        }
    }
    return fileNames;
}

function sameFileNames(
    a: ReadonlySet<string>,
    b: ReadonlySet<string>,
): boolean {
    return a.size === b.size && [...a].every(name => b.has(name));
}

async function removeBackgroundFiles(
    background: ThemeBackground | null,
): Promise<void> {
    if (!background) {
        return;
    }
    await removeBackgroundImage(background.fileName);
    await removeBackgroundImage(background.sourceFileName);
}

async function removeBackgroundFileName(
    fileName: string | undefined,
): Promise<void> {
    if (fileName !== undefined) {
        await removeBackgroundImage(fileName);
    }
}

function readPreferences(): ThemePreferences {
    subscribeCacheInvalidation();
    const version = getStoreVersion(themeStore);
    if (preferencesCache?.version === version) {
        return preferencesCache.value;
    }
    const value = parseStoredPreferences(version);
    preferencesCache = { version, value };
    return value;
}

function parseStoredPreferences(version: number): ThemePreferences {
    if (version !== STORAGE_VERSION) {
        return DEFAULT_PREFERENCES;
    }
    const stored = getObject<unknown>(themeStore, PREFERENCES_KEY);
    if (!isRecord(stored)) {
        return DEFAULT_PREFERENCES;
    }
    const packs = normalizeStoredPacks(stored.packs);
    return freezePreferences({
        packs,
        selection: normalizeStoredSelection(stored.selection, packs),
    });
}

function normalizeStoredPacks(value: unknown): readonly ThemePack[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const packs: ThemePack[] = [];
    const seen = new Set<string>();
    for (const item of value) {
        const pack = normalizeStoredPack(item);
        // 内置 id 与重复 id 都会让解析产生歧义，直接丢弃该条而非整包
        if (
            !pack ||
            seen.has(pack.id) ||
            isBuiltinThemePackId(pack.id) ||
            packs.length >= THEME_PACK_MAX_COUNT
        ) {
            continue;
        }
        seen.add(pack.id);
        packs.push(pack);
    }
    return packs;
}

function normalizeStoredPack(value: unknown): ThemePack | null {
    if (!isRecord(value) || typeof value.id !== 'string' || value.id === '') {
        return null;
    }
    return {
        id: value.id,
        name: normalizeStoredName(value.name),
        scheme: value.scheme === 'dark' ? 'dark' : 'light',
        colors: normalizeStoredColors(value.colors),
        background: normalizeStoredBackground(value.background),
        autoContrast: value.autoContrast !== false,
    };
}

function normalizeStoredName(value: unknown): string {
    if (typeof value !== 'string') {
        return '';
    }
    return [...value.trim()].slice(0, THEME_PACK_NAME_MAX_LENGTH).join('');
}

function normalizeStoredColors(value: unknown): ThemeColorOverrides {
    if (!isRecord(value)) {
        return {};
    }
    const colors: Record<string, string> = {};
    for (const [role, color] of Object.entries(value)) {
        const normalized = normalizeStoredColor(color);
        if (normalized === null || !isThemeColorRole(role)) {
            continue;
        }
        if (!THEME_OPAQUE_COLOR_ROLES.has(role)) {
            colors[role] = normalized;
            continue;
        }
        // 语义上已经不透明的 #RRGGBBFF 截断保留，真半透明的才丢弃
        const opaque = toOpaqueColor(normalized);
        if (opaque !== null) {
            colors[role] = opaque;
        }
    }
    return colors as ThemeColorOverrides;
}

function normalizeStoredBackground(value: unknown): ThemeBackground | null {
    if (
        !isRecord(value) ||
        !isSafeBackgroundImageFileName(value.fileName) ||
        !isSafeBackgroundImageFileName(value.sourceFileName)
    ) {
        return null;
    }
    return {
        fileName: value.fileName,
        sourceFileName: value.sourceFileName,
        blurRadius: normalizeStoredNumber(
            value.blurRadius,
            THEME_BACKGROUND_BLUR_MIN,
            THEME_BACKGROUND_BLUR_MAX,
            THEME_BACKGROUND_BLUR_DEFAULT,
            true,
        ),
        focusX: normalizeStoredNumber(value.focusX, 0, 1, 0.5, false),
        focusY: normalizeStoredNumber(value.focusY, 0, 1, 0.5, false),
        scale: normalizeStoredNumber(
            value.scale,
            THEME_BACKGROUND_SCALE_MIN,
            THEME_BACKGROUND_SCALE_MAX,
            THEME_BACKGROUND_SCALE_MIN,
            false,
        ),
        averageColor:
            normalizeStoredColor(value.averageColor) ??
            THEME_BACKGROUND_AVERAGE_COLOR_FALLBACK,
        // 老数据没这个字段：当作没有主色，强调色维持原样
        accentColor: normalizeOpaqueColorOrNull(value.accentColor),
        visibility: normalizeStoredNumber(
            value.visibility,
            0,
            1,
            THEME_BACKGROUND_VISIBILITY_DEFAULT,
            false,
        ),
        surfaceOpacity: normalizeStoredNumber(
            value.surfaceOpacity,
            0,
            1,
            THEME_BACKGROUND_SURFACE_OPACITY_DEFAULT,
            false,
        ),
    };
}

function normalizeStoredSelection(
    value: unknown,
    packs: readonly ThemePack[],
): ThemeSelection {
    const exists = (packId: unknown): packId is string =>
        typeof packId === 'string' &&
        (isBuiltinThemePackId(packId) ||
            packs.some(pack => pack.id === packId));
    if (isRecord(value)) {
        if (value.kind === 'fixed' && exists(value.packId)) {
            return { kind: 'fixed', packId: value.packId };
        }
        if (value.kind === 'system') {
            return {
                kind: 'system',
                dayPackId: exists(value.dayPackId)
                    ? value.dayPackId
                    : BUILTIN_LIGHT_PACK_ID,
                nightPackId: exists(value.nightPackId)
                    ? value.nightPackId
                    : BUILTIN_DARK_PACK_ID,
            };
        }
    }
    return DEFAULT_PREFERENCES.selection;
}

function freezePreferences(value: ThemePreferences): ThemePreferences {
    return Object.freeze({
        packs: Object.freeze(
            value.packs.map(pack =>
                Object.freeze({
                    ...pack,
                    colors: Object.freeze({ ...pack.colors }),
                    background: pack.background
                        ? Object.freeze({ ...pack.background })
                        : null,
                }),
            ),
        ),
        selection: Object.freeze({ ...value.selection }),
    });
}

/** 接受 #RRGGBB / #RRGGBBAA；alpha 保留——border / mask / ripple 这些角色本就是半透明的 */
function normalizeStoredColor(value: unknown): string | null {
    if (
        typeof value !== 'string' ||
        !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)
    ) {
        return null;
    }
    return value.toUpperCase();
}

function normalizeCommandColor(color: string | null): string | null {
    if (color === null) {
        return null;
    }
    const normalized = normalizeStoredColor(color);
    if (normalized === null) {
        throw new TypeError(`无效主题颜色：${String(color)}`);
    }
    return normalized;
}

/** 六位原样返回；#RRGGBBFF 截断为六位；真半透明返回 null */
function toOpaqueColor(color: string): string | null {
    if (color.length === 7) {
        return color;
    }
    return color.endsWith('FF') ? color.slice(0, 7) : null;
}

function normalizeCommandName(name: string): string {
    if (typeof name !== 'string') {
        throw new TypeError(`无效主题名称：${String(name)}`);
    }
    const trimmed = name.trim();
    const length = [...trimmed].length;
    if (length === 0 || length > THEME_PACK_NAME_MAX_LENGTH) {
        throw new RangeError(
            `主题名称须为 1–${THEME_PACK_NAME_MAX_LENGTH} 个字符`,
        );
    }
    return trimmed;
}

function normalizeCommandRatio(value: number, label: string): number {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError(`${label}须在 0–1 之间`);
    }
    return Math.round(value * 100) / 100;
}

type BackgroundShape = Omit<
    ThemeBackground,
    'fileName' | 'sourceFileName' | 'visibility' | 'surfaceOpacity'
>;

function normalizeCommandBake(bake: ThemeBackgroundBake): BackgroundShape {
    if (
        !Number.isInteger(bake.blurRadius) ||
        bake.blurRadius < THEME_BACKGROUND_BLUR_MIN ||
        bake.blurRadius > THEME_BACKGROUND_BLUR_MAX
    ) {
        throw new RangeError(
            `背景模糊须为 ${THEME_BACKGROUND_BLUR_MIN}–${THEME_BACKGROUND_BLUR_MAX} 的整数`,
        );
    }
    if (
        !Number.isFinite(bake.scale) ||
        bake.scale < THEME_BACKGROUND_SCALE_MIN ||
        bake.scale > THEME_BACKGROUND_SCALE_MAX
    ) {
        throw new RangeError(
            `背景缩放须在 ${THEME_BACKGROUND_SCALE_MIN}–${THEME_BACKGROUND_SCALE_MAX} 之间`,
        );
    }
    if (typeof bake.imageBase64 !== 'string' || bake.imageBase64 === '') {
        throw new TypeError('背景位图内容为空');
    }
    if (bake.source.kind === 'pick' && !bake.source.uri) {
        throw new TypeError('背景图片源路径不能为空');
    }
    const averageColor = normalizeStoredColor(bake.averageColor);
    if (averageColor === null) {
        throw new TypeError(`无效背景平均色：${String(bake.averageColor)}`);
    }
    const accentColor = normalizeOpaqueColorOrNull(bake.accentColor);
    if (accentColor === null && bake.accentColor != null) {
        throw new TypeError(`无效背景主色调：${String(bake.accentColor)}`);
    }
    return {
        blurRadius: bake.blurRadius,
        focusX: normalizeCommandRatio(bake.focusX, '背景横向焦点'),
        focusY: normalizeCommandRatio(bake.focusY, '背景纵向焦点'),
        scale: Math.round(bake.scale * 100) / 100,
        averageColor,
        accentColor,
    };
}

/** 不透明色或 null：非字符串、非法、真半透明都归 null（#RRGGBBFF 截断收下） */
function normalizeOpaqueColorOrNull(value: unknown): string | null {
    const normalized = normalizeStoredColor(value);
    return normalized === null ? null : toOpaqueColor(normalized);
}

function isThemeColorRole(value: string): value is ThemeColorRole {
    return THEME_COLOR_ROLE_SET.has(value);
}

function assertThemeColorRole(value: unknown): asserts value is ThemeColorRole {
    if (typeof value !== 'string' || !isThemeColorRole(value)) {
        throw new TypeError(`无效主题颜色角色：${String(value)}`);
    }
}

function normalizeStoredNumber(
    value: unknown,
    min: number,
    max: number,
    fallback: number,
    integer: boolean,
): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback;
    }
    const clamped = Math.min(max, Math.max(min, value));
    return integer ? Math.round(clamped) : Math.round(clamped * 100) / 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function enqueueBackgroundOperation<T>(
    operation: () => Promise<T>,
): Promise<T> {
    const result = backgroundOperation.then(operation);
    backgroundOperation = result.then(
        () => undefined,
        () => undefined,
    );
    return result;
}

export {
    BUILTIN_DARK_PACK_ID,
    BUILTIN_LIGHT_PACK_ID,
    BUILTIN_THEME_PACKS,
    isBuiltinThemePackId,
    provideTheme,
    resolveBackgroundImageUri,
    resolveThemePack,
    theme,
    Theme,
    THEME_BACKGROUND_BLUR_DEFAULT,
    THEME_BACKGROUND_BLUR_MAX,
    THEME_BACKGROUND_BLUR_MIN,
    THEME_BACKGROUND_SURFACE_OPACITY_DEFAULT,
    THEME_BACKGROUND_VISIBILITY_DEFAULT,
    THEME_COLOR_ROLES,
    THEME_OPAQUE_COLOR_ROLES,
    THEME_PACK_MAX_COUNT,
    THEME_PACK_NAME_MAX_LENGTH,
};
export type {
    ITheme,
    ThemeBackground,
    ThemeBackgroundBake,
    ThemeBackgroundSourceInput,
    ThemeColorOverrides,
    ThemeColorRole,
    ThemeColorScheme,
    ThemePack,
    ThemePreferences,
    ThemeSelection,
} from './types';
