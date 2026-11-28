import type { IConfig } from '@/core/config';

/** 均衡器频段元信息（设备固定：序号 / 中心频率 / 增益范围，不含当前增益） */
export interface EqualizerBandMeta {
    /** 频段序号（0 起连续） */
    index: number;
    /** 中心频率（Hz） */
    centerFreq: number;
    /** 增益下限（millibel） */
    minGain: number;
    /** 增益上限（millibel） */
    maxGain: number;
}

/** 均衡器频段（元信息 + 当前增益），供 UI 渲染一根滑块 */
export interface EqualizerBand extends EqualizerBandMeta {
    /** 当前增益（millibel） */
    gain: number;
}

/** 音效模块端口：UX 经此读写均衡器；由 app/container 注入实现 */
export interface IAudioEffect {
    /**
     * 启动：探测均衡器可用性、加载设备频段 / 预设、把持久化配置重放到原生
     * 须在 player.setup()（引擎 audioSessionId 就绪）之后调；幂等，重复调用共享同一次
     */
    setup(): Promise<void>;
    /** 均衡器开关（关 = 旁路，增益保留） */
    setEqualizerEnabled(enabled: boolean): Promise<void>;
    /** 设某频段增益（millibel）；按设备范围 clamp；转自定义态；关闭时自动开启 */
    setEqualizerBandGain(index: number, millibel: number): Promise<void>;
    /** 套用系统预设（英文原名）；回读结果增益；关闭时自动开启 */
    applyEqualizerPreset(name: string): Promise<void>;
    /** 切回自定义：恢复上次自定义曲线（无快照 / 段数不符则全 0）；关闭时自动开启 */
    applyEqualizerCustom(): Promise<void>;
    /** 重置所有频段增益为 0（转自定义；开关状态不变） */
    resetEqualizer(): Promise<void>;
}

/** 构造注入依赖 */
export interface AudioEffectDeps {
    /** 持久化 EQ 配置（真相源）；反应式镜像在 store atom */
    config: IConfig;
}
