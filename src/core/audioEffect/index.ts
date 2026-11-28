/**
 * 音效模块：均衡器的业务属主
 * config 是 EQ 配置真相源（enabled / gains / preset），原生 Equalizer 不跨进程持久（重启归零），
 * 故 setup() 在引擎就绪后把持久配置重放到原生；每次动作先同步提交 JS 态（atom + config）再 post 原生
 * available 由 eqGetBands 是否返回频段判定，false 时 UI 隐藏入口
 */
import { audioEngine } from '@/native/audioEngine';
import { atomStore } from '@/utils/atomStore';

import {
    equalizerAvailableAtom,
    equalizerBandMetaAtom,
    equalizerEnabledAtom,
    equalizerGainsAtom,
    equalizerPresetAtom,
    equalizerPresetsAtom,
} from './store';

import type { AudioEffectDeps, EqualizerBandMeta, IAudioEffect } from './types';
import type { IConfig } from '@/core/config';

/** 归一化到有限整数并夹到设备区间（millibel）；非数字 / NaN → 0，与原生 toInt 截断对齐 */
function normalizeGain(value: unknown, min: number, max: number): number {
    const n =
        typeof value === 'number' && Number.isFinite(value)
            ? Math.round(value)
            : 0;
    return n < min ? min : n > max ? max : n;
}

export class AudioEffect implements IAudioEffect {
    readonly #config: IConfig;
    /** setup 单次 promise：并发 / 重复调用共享同一次初始化 */
    #setupPromise: Promise<void> | null = null;
    /** 曲线编辑代次：拖频段 / 重置 / 套预设各 +1；预设回读发现代次已变即丢弃（被更新的编辑抢先） */
    #editSeq = 0;

    constructor(deps: AudioEffectDeps) {
        this.#config = deps.config;
    }

    setup(): Promise<void> {
        this.#setupPromise ??= this.#runSetup();
        return this.#setupPromise;
    }

    async #runSetup(): Promise<void> {
        const bands = await this.#getBands();
        if (bands.length === 0) {
            return; // 设备无均衡器：available 保持 false，入口隐藏
        }
        const meta: EqualizerBandMeta[] = bands.map(b => ({
            index: b.index,
            centerFreq: b.centerFreq,
            minGain: b.minGain,
            maxGain: b.maxGain,
        }));
        // 「Flat」（全 0）与中性 / 自定义态等价、冗余，不作为可选预设呈现
        const presets = (await this.#getPresets()).filter(p => p !== 'Flat');

        const enabled = this.#config.get('audioEffect.eqEnabled') ?? false;
        const persisted = this.#config.get('audioEffect.eqGains');

        // 段数匹配 → 重放（归一化 + clamp）；与持久值不同则写回，保持 config↔atom 一致
        // 首次 / 换设备段数不符 → 拉平并落库
        let gains: number[];
        if (Array.isArray(persisted) && persisted.length === meta.length) {
            let changed = false;
            gains = meta.map((m, i) => {
                const g = normalizeGain(persisted[i], m.minGain, m.maxGain);
                if (g !== persisted[i]) {
                    changed = true;
                }
                return g;
            });
            if (changed) {
                this.#config.set('audioEffect.eqGains', gains);
            }
        } else {
            gains = meta.map(() => 0);
            this.#config.set('audioEffect.eqGains', gains);
            this.#config.set('audioEffect.eqPreset', undefined);
        }

        // 选中预设仅当仍在设备预设列表内才保留，否则回落自定义
        let preset = this.#config.get('audioEffect.eqPreset') ?? null;
        if (preset !== null && !presets.includes(preset)) {
            preset = null;
            this.#config.set('audioEffect.eqPreset', undefined);
        }

        // 重放到原生（同步 post，保持顺序；桥错误吞掉）
        for (const m of meta) {
            audioEngine
                .eqSetBandGain(m.index, gains[m.index] ?? 0)
                .catch(() => {});
        }
        audioEngine.eqSetEnabled(enabled).catch(() => {});

        atomStore.set(equalizerBandMetaAtom, meta);
        atomStore.set(equalizerPresetsAtom, presets);
        atomStore.set(equalizerGainsAtom, gains);
        atomStore.set(equalizerEnabledAtom, enabled);
        atomStore.set(equalizerPresetAtom, preset);
        atomStore.set(equalizerAvailableAtom, true);
    }

    setEqualizerEnabled(enabled: boolean): Promise<void> {
        if (!atomStore.get(equalizerAvailableAtom)) {
            return Promise.resolve();
        }
        // 开关与曲线编辑正交，不动 editSeq；先提交 JS 态再 post 原生
        atomStore.set(equalizerEnabledAtom, enabled);
        this.#config.set('audioEffect.eqEnabled', enabled);
        return audioEngine.eqSetEnabled(enabled).catch(() => {});
    }

    setEqualizerBandGain(index: number, millibel: number): Promise<void> {
        const band = atomStore.get(equalizerBandMetaAtom)[index];
        if (!band) {
            return Promise.resolve();
        }
        this.#editSeq++;
        const gain = normalizeGain(millibel, band.minGain, band.maxGain);
        const gains = atomStore.get(equalizerGainsAtom).slice();
        gains[index] = gain;
        // 同步提交：曲线 + 转自定义 + 关闭态自动开启，均在 post 原生前完成，杜绝并发拖动丢更新
        this.#commitGains(gains);
        this.#dropPreset();
        if (this.#turnOnIfOff()) {
            audioEngine.eqSetEnabled(true).catch(() => {});
        }
        return audioEngine.eqSetBandGain(index, gain).catch(() => {});
    }

    async applyEqualizerPreset(name: string): Promise<void> {
        if (!atomStore.get(equalizerAvailableAtom)) {
            return;
        }
        if (!atomStore.get(equalizerPresetsAtom).includes(name)) {
            return; // 未知预设名：忽略（原生对不存在的名字也是 no-op）
        }
        // 自定义 → 预设的跃迁：先把当下曲线快照进自定义槽，供之后切回自定义时恢复
        if (atomStore.get(equalizerPresetAtom) === null) {
            this.#config.set(
                'audioEffect.eqCustomGains',
                atomStore.get(equalizerGainsAtom).slice(),
            );
        }
        const gen = ++this.#editSeq;
        // 乐观自动开启：与选预设同一视觉节拍翻转开关；后发的显式关闭晚于此、故能胜出
        if (this.#turnOnIfOff()) {
            audioEngine.eqSetEnabled(true).catch(() => {});
        }
        audioEngine.eqUsePreset(name).catch(() => {}); // 同步 post 原生写各段
        const bands = await this.#getBands(); // 回读预设写好的增益
        if (gen !== this.#editSeq) {
            return; // 回读期间有更新的编辑抢先 → 丢弃本次结果
        }
        const meta = atomStore.get(equalizerBandMetaAtom);
        if (bands.length !== meta.length) {
            return; // 回读异常：不提交预设名 / 增益，避免「新名 + 旧值」
        }
        const gains = meta.map((m, i) =>
            normalizeGain(bands[i]?.gain, m.minGain, m.maxGain),
        );
        this.#commitGains(gains);
        atomStore.set(equalizerPresetAtom, name);
        this.#config.set('audioEffect.eqPreset', name);
    }

    /** 切回自定义：恢复自定义槽曲线（无有效快照则全 0）；与选预设同规则，关闭时自动开启 */
    applyEqualizerCustom(): Promise<void> {
        const meta = atomStore.get(equalizerBandMetaAtom);
        if (meta.length === 0) {
            return Promise.resolve();
        }
        // 代次先行：作废可能在途的预设回读（其 eqUsePreset 已写脏原生，下面逐段重申即可覆盖）
        this.#editSeq++;
        const gains =
            atomStore.get(equalizerPresetAtom) === null
                ? // 已是自定义态：曲线就是用户眼前这条，不动它，只重申到原生
                  atomStore.get(equalizerGainsAtom).slice()
                : this.#restoreCustomGains(meta);
        this.#commitGains(gains);
        this.#dropPreset();
        if (this.#turnOnIfOff()) {
            audioEngine.eqSetEnabled(true).catch(() => {});
        }
        return Promise.all(
            meta.map(m =>
                audioEngine
                    .eqSetBandGain(m.index, gains[m.index] ?? 0)
                    .catch(() => {}),
            ),
        ).then(() => {});
    }

    resetEqualizer(): Promise<void> {
        const meta = atomStore.get(equalizerBandMetaAtom);
        if (meta.length === 0) {
            return Promise.resolve();
        }
        this.#editSeq++;
        const gains = meta.map(() => 0);
        this.#commitGains(gains);
        this.#dropPreset();
        // 开关状态不变；各段归零同步 post
        return Promise.all(
            meta.map(m =>
                audioEngine.eqSetBandGain(m.index, 0).catch(() => {}),
            ),
        ).then(() => {});
    }

    // —— 同步提交助手（atom 镜像 + config 落库）——

    /** 读自定义槽：段数不符（换设备）/ 非数组则全 0；个别非法值按 normalizeGain 归 0 */
    #restoreCustomGains(meta: readonly EqualizerBandMeta[]): number[] {
        const saved = this.#config.get('audioEffect.eqCustomGains');
        if (!Array.isArray(saved) || saved.length !== meta.length) {
            return meta.map(() => 0);
        }
        return meta.map((m, i) =>
            normalizeGain(saved[i], m.minGain, m.maxGain),
        );
    }

    #commitGains(gains: number[]): void {
        atomStore.set(equalizerGainsAtom, gains);
        this.#config.set('audioEffect.eqGains', gains);
    }

    /** 手动改动 → 退预设高亮转自定义（幂等） */
    #dropPreset(): void {
        if (atomStore.get(equalizerPresetAtom) !== null) {
            atomStore.set(equalizerPresetAtom, null);
            this.#config.set('audioEffect.eqPreset', undefined);
        }
    }

    /** 关闭态 → 置开启（返回是否翻转，供调用方决定要不要 post 原生）；幂等 */
    #turnOnIfOff(): boolean {
        if (atomStore.get(equalizerEnabledAtom)) {
            return false;
        }
        atomStore.set(equalizerEnabledAtom, true);
        this.#config.set('audioEffect.eqEnabled', true);
        return true;
    }

    // —— 原生 query 包裹：桥错误 / 不支持时回空，供上层降级 ——

    async #getBands() {
        try {
            return await audioEngine.eqGetBands();
        } catch {
            return [];
        }
    }

    async #getPresets(): Promise<string[]> {
        try {
            return await audioEngine.eqGetPresets();
        } catch {
            return [];
        }
    }
}

/** 裸对象 live-binding，UX 直接 audioEffect.xxx；由 app/container 装配 */
export let audioEffect: IAudioEffect;

/** 仅 app/container 调：装配 audioEffect 单例 */
export function provideAudioEffect(instance: IAudioEffect): void {
    audioEffect = instance;
}

export {
    useEqualizerAvailable,
    useEqualizerBands,
    useEqualizerEnabled,
    useEqualizerPreset,
    useEqualizerPresets,
} from './hooks';

export type { IAudioEffect, EqualizerBand, EqualizerBandMeta } from './types';
