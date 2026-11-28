/**
 * 悬浮歌词协调器（Android-only 副作用 core）：把 config 的悬浮歌词配置同步到原生浮层、
 * 把浮层回流（拖动位置 / 锁定 / 关闭）写回 config、把 lyric 当前内容推给浮层
 * 两种形态互斥单选：桌面歌词卡（可交互）与状态栏条（纯展示），由 floatingLyric.mode 决定
 * config 是配置真相：字号 / 颜色 / 锁定等无副作用项 UI 直写 config；仅 enable/disable 走本模块命令（enable 带 overlay 权限副作用）
 * enable 先查权限再持久化，无权限发「权限请求」事件让 UI 引导授权；「设置请求」事件供浮层设置键在前台拉起面板
 */
import { AppState } from 'react-native';

import { os } from '@/infra/device';
import systemGates from '@/infra/systemGates';
import { isPlaybackActive } from '@/native/audioEngine';
import { floatingLyric as nativeFloatingLyric } from '@/native/floatingLyric';

import type { ConfigKey, IConfig } from '@/core/config';
import type { ILyric, LyricContent } from '@/core/lyric';
import type { IPlayer } from '@/core/player';
import type {
    FloatingLyricConfig,
    FloatingLyricLabels,
} from '@/native/floatingLyric';
import type { MusicItem } from '@/types';

/** 影响浮层的配置项：任一变化触发一次调谐 */
const FLOATING_LYRIC_KEYS = [
    'floatingLyric.enabled',
    'floatingLyric.mode',
    'floatingLyric.textColor',
    'floatingLyric.desktop.fontSize',
    'floatingLyric.desktop.backgroundOpacity',
    'floatingLyric.desktop.positionY',
    'floatingLyric.desktop.locked',
    'floatingLyric.statusBar.fontSize',
    'floatingLyric.statusBar.backgroundOpacity',
    'floatingLyric.statusBar.positionY',
    'lyric.showTranslation',
] as const satisfies readonly ConfigKey[];

/** 桌面歌词卡字号档位（dp，严格递增）：档位表是产品策略，原生只按当前值的下标取相邻项；设置面板共用同一份 */
export const DESKTOP_FONT_SIZE_STEPS = [14, 16, 18, 21, 24] as const;

/** 状态栏条字号档位（dp，严格递增）：单行且贴顶，整体比卡片小一档 */
export const STATUS_BAR_FONT_SIZE_STEPS = [12, 13, 14, 16, 18] as const;

/**
 * 把配置里的字号解析成实际生效的档位
 * config 值域比档位表宽（备份恢复等可能带来表外值），下发原生与面板回显都必须走它，否则两边显示会打架
 * 档位表要求非空：无初始值的 reduce 遇空数组会抛
 */
export function resolveFontSize(
    value: number,
    steps: readonly [number, ...number[]],
): number {
    return steps.reduce((best, step) =>
        Math.abs(step - value) < Math.abs(best - value) ? step : best,
    );
}

/** 色条档位：两形态共用；全为高明度色，保证在暗底上可读 */
const TEXT_COLOR_OPTIONS = [
    '#FFFFFF',
    '#FFE7BC',
    '#FFC24D',
    '#FF9F5A',
    '#FF7E7E',
    '#FF8CC8',
    '#C79BFF',
    '#7FB2FF',
    '#5FD6D6',
    '#9BE36D',
];

/** 文案占位：i18n 在 app 层，bootstrap 会在 setup 前推入真实文案 */
const EMPTY_LABELS: FloatingLyricLabels = {
    openApp: '',
    close: '',
    lock: '',
    settings: '',
    play: '',
    pause: '',
    previous: '',
    next: '',
    textColor: '',
    fontSize: '',
    fontSmaller: '',
    fontLarger: '',
    lockedHint: '',
};

/** 悬浮歌词协调器端口：由 bootstrap 启动，随进程存活 */
export interface IFloatingLyric {
    /** 启动：订阅 config / 歌词 / 当前歌 / native 事件 + AppState，据 config 与权限调谐浮层；幂等；非 Android 为空操作 */
    setup(): void;
    /** 停止：退订、失效在途、隐藏浮层；幂等（主要供测试，生产随进程存活） */
    dispose(): void;
    /**
     * 推入浮层文案（含读屏标签）：i18n 属 app 层，core 不 import，故由 bootstrap 在 setup 前推一次、语言切换时重推
     * 已显示时立即刷新
     */
    setLabels(labels: FloatingLyricLabels): void;
    /** 开启：查 overlay 权限，有则持久化（订阅触发显示）、无则发权限请求事件引导；防连点；非 Android 空操作。无当前歌时仅持久化、有歌才显示 */
    enable(): Promise<void>;
    /** 关闭：持久化 enabled=false（订阅触发收起），并作废在途 enable */
    disable(): void;
    /** 订阅「请求打开设置面板」（悬浮条设置键，App 前台）：返回退订 */
    subscribeSettingsRequest(cb: () => void): () => void;
    /** 订阅「请求回到正在播放页」（浮层应用标记；App 已被原生拉到前台）：返回退订 */
    subscribeOpenAppRequest(cb: () => void): () => void;
    /** 订阅「enable 无 overlay 权限、需引导授权」：返回退订 */
    subscribePermissionRequest(cb: () => void): () => void;
}

/** 构造注入依赖 */
export interface FloatingLyricDeps {
    config: IConfig;
    lyric: ILyric;
    player: IPlayer;
}

export class FloatingLyric implements IFloatingLyric {
    readonly #config: IConfig;
    readonly #lyric: ILyric;
    readonly #player: IPlayer;

    #started = false;
    #disposed = false;
    /** 原生窗口是否已显示（仅 native show 成功后置真） */
    #isShown = false;
    /** 下次调谐需重查 overlay 权限（回前台设：权限可能在系统设置里被撤销） */
    #recheckPermission = false;
    /** 调谐是否在进行中；配合 #dirty 串行化，防异步权限查询与快速开关竞态 */
    #reconciling = false;
    #dirty = false;
    /** 在途 enable 的代次（null=无在途，兼作防连点）；await 权限期间被 disable/dispose 清掉即作废，防迟到结果覆盖 */
    #enablingToken: number | null = null;
    #tokenSeq = 0;
    #content: LyricContent = { kind: 'none' };
    #currentMusic: MusicItem | null = null;
    /** 播放态镜像：只用于浮层播放键的图标（是否画成暂停），命令裁决交给 player */
    #playing = false;
    #labels: FloatingLyricLabels = EMPTY_LABELS;
    #unsubs: Array<() => void> = [];
    /** UI 订阅：设置请求 / 权限请求 / 回正在播放页请求（app 启动订阅，随进程存活） */
    #settingsRequestCbs = new Set<() => void>();
    #permissionRequestCbs = new Set<() => void>();
    #openAppRequestCbs = new Set<() => void>();

    constructor(deps: FloatingLyricDeps) {
        this.#config = deps.config;
        this.#lyric = deps.lyric;
        this.#player = deps.player;
    }

    setup(): void {
        if (os !== 'android' || this.#started) {
            return;
        }
        this.#started = true;
        try {
            // 逐个登记退订：任一订阅（如 Android 缺模块）抛错时能清掉已建立的
            this.#unsubs.push(
                this.#config.subscribe(FLOATING_LYRIC_KEYS, () =>
                    this.#requestReconcile(),
                ),
            );
            this.#unsubs.push(
                this.#player.subscribeCurrentMusic(item => {
                    this.#currentMusic = item;
                    this.#pushContent();
                    this.#requestReconcile();
                }),
            );
            this.#unsubs.push(
                this.#player.subscribePlaybackState(state => {
                    this.#playing = isPlaybackActive(state);
                    this.#pushPlaying();
                }),
            );
            this.#unsubs.push(
                this.#lyric.subscribeLyricContent(content => {
                    this.#content = content;
                    this.#pushContent();
                }),
            );
            this.#unsubs.push(
                nativeFloatingLyric.onPositionChange(y =>
                    this.#config.set('floatingLyric.desktop.positionY', y),
                ),
            );
            this.#unsubs.push(
                nativeFloatingLyric.onRequestLock(() =>
                    this.#config.set('floatingLyric.desktop.locked', true),
                ),
            );
            this.#unsubs.push(
                nativeFloatingLyric.onRequestClose(() => this.disable()),
            );
            this.#unsubs.push(
                nativeFloatingLyric.onRequestPlayToggle(() => {
                    this.#player.togglePlayback().catch(() => {});
                }),
            );
            this.#unsubs.push(
                nativeFloatingLyric.onRequestSkipToNext(() => {
                    this.#player.skipToNext().catch(() => {});
                }),
            );
            this.#unsubs.push(
                nativeFloatingLyric.onRequestSkipToPrevious(() => {
                    this.#player.skipToPrevious().catch(() => {});
                }),
            );
            this.#unsubs.push(
                nativeFloatingLyric.onTextColorChange(hex =>
                    this.#config.set('floatingLyric.textColor', hex),
                ),
            );
            this.#unsubs.push(
                nativeFloatingLyric.onFontSizeChange(sp =>
                    this.#config.set('floatingLyric.desktop.fontSize', sp),
                ),
            );
            this.#unsubs.push(
                nativeFloatingLyric.onRequestOpenApp(() => {
                    // 原生已把 App 拉到前台，这里只负责落到正在播放页
                    this.#emitOpenAppRequest();
                }),
            );
            this.#unsubs.push(
                nativeFloatingLyric.onRequestOpenSettings(() => {
                    // 仅 App 前台派发（打开 App 内 Panel）；后台丢弃，待 bringToForeground 后再扩展
                    if (AppState.currentState === 'active') {
                        this.#emitSettingsRequest();
                    }
                }),
            );
            const appStateSub = AppState.addEventListener('change', state => {
                // 回前台重查权限并调谐：overlay 权限可能在系统设置里被撤销
                if (state === 'active') {
                    this.#recheckPermission = true;
                    this.#requestReconcile();
                }
            });
            this.#unsubs.push(() => appStateSub.remove());
        } catch (e) {
            // 半初始化清理：退订已建立的、允许后续重试；错误上抛以暴露（如 Android 缺模块）
            this.#teardownSubs();
            this.#started = false;
            throw e;
        }
        this.#requestReconcile();
    }

    async enable(): Promise<void> {
        if (os !== 'android' || this.#disposed) {
            return;
        }
        // 已开则无需再查权限
        if (this.#config.get('floatingLyric.enabled') ?? false) {
            return;
        }
        // 已有在途 enable：不重复启动（disable 会作废它、放行新的 enable）
        if (this.#enablingToken !== null) {
            return;
        }
        const token = ++this.#tokenSeq;
        this.#enablingToken = token;
        try {
            let granted: boolean;
            try {
                granted = await systemGates.canDrawOverlays();
            } catch {
                // 权限查询罕见失败：不开、不引导，用户可重试（core 无 toast）
                return;
            }
            // await 期间被 disable/dispose/新 enable 作废：丢弃迟到结果，不覆盖用户新意图
            if (this.#enablingToken !== token || this.#disposed) {
                return;
            }
            if (granted) {
                // 有权限：持久化，订阅触发 reconcile 显示
                this.#config.set('floatingLyric.enabled', true);
            } else {
                // 无权限：发事件让 UI 引导授权，不写 enabled（避免 reconcile 又回写 false 的无反馈）
                this.#emitPermissionRequest();
            }
        } finally {
            // 只清自己的 token，避免抹掉后来 enable 的在途标记
            if (this.#enablingToken === token) {
                this.#enablingToken = null;
            }
        }
    }

    setLabels(labels: FloatingLyricLabels): void {
        this.#labels = labels;
        this.#requestReconcile();
    }

    disable(): void {
        // 作废在途 enable（放行后续新 enable），再持久化关闭
        this.#enablingToken = null;
        this.#config.set('floatingLyric.enabled', false);
    }

    subscribeSettingsRequest(cb: () => void): () => void {
        this.#settingsRequestCbs.add(cb);
        return () => {
            this.#settingsRequestCbs.delete(cb);
        };
    }

    subscribePermissionRequest(cb: () => void): () => void {
        this.#permissionRequestCbs.add(cb);
        return () => {
            this.#permissionRequestCbs.delete(cb);
        };
    }

    subscribeOpenAppRequest(cb: () => void): () => void {
        this.#openAppRequestCbs.add(cb);
        return () => {
            this.#openAppRequestCbs.delete(cb);
        };
    }

    #emitSettingsRequest(): void {
        this.#settingsRequestCbs.forEach(cb => cb());
    }

    #emitPermissionRequest(): void {
        this.#permissionRequestCbs.forEach(cb => cb());
    }

    #emitOpenAppRequest(): void {
        this.#openAppRequestCbs.forEach(cb => cb());
    }

    dispose(): void {
        this.#disposed = true;
        this.#dirty = false;
        this.#enablingToken = null;
        this.#settingsRequestCbs.clear();
        this.#permissionRequestCbs.clear();
        this.#openAppRequestCbs.clear();
        this.#teardownSubs();
        if (this.#isShown) {
            this.#isShown = false;
            nativeFloatingLyric.hide().catch(() => {});
        }
    }

    #teardownSubs(): void {
        this.#unsubs.forEach(u => u());
        this.#unsubs = [];
    }

    /** 请求一次调谐；正在进行则打脏标记，由当前循环续跑最新状态（串行、不并发） */
    #requestReconcile(): void {
        if (this.#disposed) {
            return;
        }
        this.#dirty = true;
        if (!this.#reconciling) {
            this.#runReconcile().catch(() => {});
        }
    }

    async #runReconcile(): Promise<void> {
        this.#reconciling = true;
        try {
            while (this.#dirty && !this.#disposed) {
                this.#dirty = false;
                try {
                    await this.#reconcileOnce();
                } catch {
                    // 调谐失败（权限查询 / native 操作异常）：吞掉，等下次事件再试
                }
            }
        } finally {
            this.#reconciling = false;
        }
    }

    async #reconcileOnce(): Promise<void> {
        const recheck = this.#recheckPermission;
        this.#recheckPermission = false;
        if (!this.#shouldShow()) {
            await this.#ensureHidden();
            return;
        }
        // 首次显示、或回前台需重查权限时，都验一次 overlay 权限
        if (!this.#isShown || recheck) {
            const granted = await systemGates.canDrawOverlays();
            if (this.#disposed || !this.#shouldShow()) {
                return;
            }
            if (!granted) {
                // 确认无权限：回写 enabled=false（避免 UI「假装已开启」）+ 收起可能残留的窗口
                this.#config.set('floatingLyric.enabled', false);
                await this.#ensureHidden();
                return;
            }
        }
        if (this.#isShown) {
            await nativeFloatingLyric.update(this.#buildConfig());
        } else {
            await nativeFloatingLyric.show(this.#buildConfig());
            // show 成功即置已显示：先标记再据 disposed/shouldShow 决定收起，否则 dispose/关闭竞态会漏窗
            this.#isShown = true;
            if (this.#disposed || !this.#shouldShow()) {
                await this.#ensureHidden();
                return;
            }
            // 建窗前的 setLine 会被原生丢弃，show 成功后补推一次当前内容与播放态
            this.#pushContent();
            this.#pushPlaying();
        }
    }

    /** best-effort 收起窗口（幂等） */
    async #ensureHidden(): Promise<void> {
        if (!this.#isShown) {
            return;
        }
        this.#isShown = false;
        await nativeFloatingLyric.hide().catch(() => {});
    }

    /** 显示条件：开关开 且 有当前歌（无歌不显示；不看播放态，暂停 / 停止照显） */
    #shouldShow(): boolean {
        return (
            (this.#config.get('floatingLyric.enabled') ?? false) &&
            this.#currentMusic !== null
        );
    }

    /**
     * 从 config 组装原生快照：字号吸附到档位、颜色统一大写，保证原生查下标不落空
     * 形态私有项（字号 / 底色 / 位置）各读各的键，共用会互相冲掉——两者的归一化基准不同
     */
    #buildConfig(): FloatingLyricConfig {
        const c = this.#config;
        const mode = c.get('floatingLyric.mode') ?? 'desktop';
        const statusBar = mode === 'statusBar';
        const steps = statusBar
            ? STATUS_BAR_FONT_SIZE_STEPS
            : DESKTOP_FONT_SIZE_STEPS;
        return {
            mode,
            fontSize: resolveFontSize(
                statusBar
                    ? c.get('floatingLyric.statusBar.fontSize') ?? 14
                    : c.get('floatingLyric.desktop.fontSize') ?? 18,
                steps,
            ),
            fontSizeSteps: [...steps],
            textColor: (
                c.get('floatingLyric.textColor') ?? '#FFFFFF'
            ).toUpperCase(),
            textColorOptions: TEXT_COLOR_OPTIONS,
            backgroundOpacity: statusBar
                ? c.get('floatingLyric.statusBar.backgroundOpacity') ?? 0
                : c.get('floatingLyric.desktop.backgroundOpacity') ?? 0.55,
            // 状态栏条恒 1 行，放不下译文
            showTranslation:
                !statusBar && (c.get('lyric.showTranslation') ?? false),
            // 状态栏条永久穿透，没有锁定这个概念
            locked:
                statusBar || (c.get('floatingLyric.desktop.locked') ?? false),
            positionY: statusBar
                ? c.get('floatingLyric.statusBar.positionY') ?? 0
                : c.get('floatingLyric.desktop.positionY') ?? 0.18,
            labels: this.#labels,
        };
    }

    /** 把当前内容推给浮层（未显示则无窗口可推、跳过）；无歌词行时兜底「歌名-作者」 */
    #pushContent(): void {
        if (!this.#isShown) {
            return;
        }
        if (this.#content.kind === 'line') {
            const { line } = this.#content;
            nativeFloatingLyric.setLine(line.text, line.translation ?? null);
        } else {
            nativeFloatingLyric.setLine(this.#fallbackText(), null);
        }
    }

    /** 把播放态推给浮层（未显示则无窗口可推、跳过） */
    #pushPlaying(): void {
        if (!this.#isShown) {
            return;
        }
        nativeFloatingLyric.setPlaying(this.#playing);
    }

    /** 兜底文本：非空 title / artist 过滤后以「 - 」连接，避免空分隔符 */
    #fallbackText(): string {
        const m = this.#currentMusic;
        if (!m) {
            return '';
        }
        return [m.title, m.artist]
            .filter(s => typeof s === 'string' && s.trim().length > 0)
            .join(' - ');
    }
}

/** 裸对象 live-binding：由 app/container 装配（无 UI 消费者，仅 bootstrap 启动） */
export let floatingLyric: IFloatingLyric;

/** 仅供 app/container 调用：装配 floatingLyric 单例 */
export function provideFloatingLyric(instance: IFloatingLyric): void {
    floatingLyric = instance;
}
