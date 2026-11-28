/**
 * AudioEffect 纯逻辑单测：可用性判定、持久增益重放 / 归一化 / clamp 写回、预设校验与回读、
 * 自定义派生、自动开启、重置、回读竞态丢弃
 * 原生桥 @/native/audioEngine 被 mock；config 用内存 fake；store atoms 每例前重置
 */
jest.mock('@/native/audioEngine', () => ({
    audioEngine: {
        eqGetBands: jest.fn(),
        eqGetPresets: jest.fn(),
        eqSetBandGain: jest.fn(),
        eqSetEnabled: jest.fn(),
        eqUsePreset: jest.fn(),
    },
}));

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

import { AudioEffect } from '.';

import type { ConfigKey, ConfigSchema, IConfig } from '@/core/config';
import type { EqBand } from '@/native/audioEngine';

const engine = audioEngine as jest.Mocked<typeof audioEngine>;

/** 内存 config fake（隔离每例；undefined 视为清除） */
function makeConfig(initial: Partial<ConfigSchema> = {}): IConfig {
    const store = new Map<string, unknown>(Object.entries(initial));
    return {
        get<K extends ConfigKey>(key: K): ConfigSchema[K] | undefined {
            return store.get(key) as ConfigSchema[K] | undefined;
        },
        getStored<K extends ConfigKey>(key: K): ConfigSchema[K] | undefined {
            // 内存 fake 本就无默认回落，getStored 与 get 同源
            return store.get(key) as ConfigSchema[K] | undefined;
        },
        set<K extends ConfigKey>(key: K, value?: ConfigSchema[K]): void {
            if (value === undefined) {
                store.delete(key);
            } else {
                store.set(key, value);
            }
        },
        isValid<K extends ConfigKey>(
            _key: K,
            _value: unknown,
        ): _value is ConfigSchema[K] {
            // 本套用例不涉及值域校验，一律放行
            return true;
        },
        subscribe(): () => void {
            return () => {};
        },
    };
}

/** 两段设备频段（±15dB = ±1500mB） */
const BANDS: EqBand[] = [
    { index: 0, centerFreq: 60, gain: 0, minGain: -1500, maxGain: 1500 },
    { index: 1, centerFreq: 230, gain: 0, minGain: -1500, maxGain: 1500 },
];

beforeEach(() => {
    jest.resetAllMocks();
    engine.eqSetBandGain.mockResolvedValue(undefined);
    engine.eqSetEnabled.mockResolvedValue(undefined);
    engine.eqUsePreset.mockResolvedValue(undefined);
    engine.eqGetPresets.mockResolvedValue([]);
    // eqGetBands 无默认：每例自设
    atomStore.set(equalizerAvailableAtom, false);
    atomStore.set(equalizerBandMetaAtom, []);
    atomStore.set(equalizerGainsAtom, []);
    atomStore.set(equalizerEnabledAtom, false);
    atomStore.set(equalizerPresetAtom, null);
    atomStore.set(equalizerPresetsAtom, []);
});

test('设备无频段 → 不可用、入口隐藏', async () => {
    engine.eqGetBands.mockResolvedValue([]);
    await new AudioEffect({ config: makeConfig() }).setup();
    expect(atomStore.get(equalizerAvailableAtom)).toBe(false);
});

test('持久增益段数不匹配设备 → 拉平并归一化落库', async () => {
    engine.eqGetBands.mockResolvedValue(BANDS);
    const config = makeConfig({ 'audioEffect.eqGains': [300, 300, 300] });
    await new AudioEffect({ config }).setup();
    expect(atomStore.get(equalizerAvailableAtom)).toBe(true);
    expect(atomStore.get(equalizerGainsAtom)).toEqual([0, 0]);
    expect(config.get('audioEffect.eqGains')).toEqual([0, 0]);
});

test('段数匹配 → 重放持久增益与开关到原生', async () => {
    engine.eqGetBands.mockResolvedValue(BANDS);
    const config = makeConfig({
        'audioEffect.eqEnabled': true,
        'audioEffect.eqGains': [600, -300],
    });
    await new AudioEffect({ config }).setup();
    expect(engine.eqSetBandGain).toHaveBeenCalledWith(0, 600);
    expect(engine.eqSetBandGain).toHaveBeenCalledWith(1, -300);
    expect(engine.eqSetEnabled).toHaveBeenCalledWith(true);
    expect(atomStore.get(equalizerGainsAtom)).toEqual([600, -300]);
});

test('越界持久增益重放时 clamp 并写回 config', async () => {
    engine.eqGetBands.mockResolvedValue(BANDS);
    const config = makeConfig({ 'audioEffect.eqGains': [99999, -99999] });
    await new AudioEffect({ config }).setup();
    expect(atomStore.get(equalizerGainsAtom)).toEqual([1500, -1500]);
    expect(config.get('audioEffect.eqGains')).toEqual([1500, -1500]);
});

test('损坏持久增益（NaN / 非数字）归一化为 0 并写回', async () => {
    engine.eqGetBands.mockResolvedValue(BANDS);
    const config = makeConfig({
        'audioEffect.eqGains': [NaN, 'x' as unknown as number],
    });
    await new AudioEffect({ config }).setup();
    expect(atomStore.get(equalizerGainsAtom)).toEqual([0, 0]);
    expect(config.get('audioEffect.eqGains')).toEqual([0, 0]);
});

test('持久预设已不在设备列表 → 回落自定义并清除', async () => {
    engine.eqGetBands.mockResolvedValue(BANDS);
    engine.eqGetPresets.mockResolvedValue(['Rock']);
    const config = makeConfig({
        'audioEffect.eqGains': [0, 0],
        'audioEffect.eqPreset': 'Jazz',
    });
    await new AudioEffect({ config }).setup();
    expect(atomStore.get(equalizerPresetAtom)).toBeNull();
    expect(config.get('audioEffect.eqPreset')).toBeUndefined();
});

test('设置频段增益：clamp + 转自定义 + 关闭态自动开启', async () => {
    engine.eqGetBands.mockResolvedValue(BANDS);
    engine.eqGetPresets.mockResolvedValue(['Normal']);
    const config = makeConfig({
        'audioEffect.eqPreset': 'Normal',
        'audioEffect.eqGains': [0, 0],
    });
    const fx = new AudioEffect({ config });
    await fx.setup();
    expect(atomStore.get(equalizerPresetAtom)).toBe('Normal');

    await fx.setEqualizerBandGain(0, 99999);
    expect(engine.eqSetBandGain).toHaveBeenLastCalledWith(0, 1500);
    expect(atomStore.get(equalizerGainsAtom)).toEqual([1500, 0]);
    expect(atomStore.get(equalizerPresetAtom)).toBeNull();
    expect(atomStore.get(equalizerEnabledAtom)).toBe(true);
    expect(config.get('audioEffect.eqEnabled')).toBe(true);
    expect(config.get('audioEffect.eqPreset')).toBeUndefined();
});

test('套用预设：回读增益 + 记预设名 + 自动开启', async () => {
    engine.eqGetBands
        .mockResolvedValueOnce(BANDS) // setup
        .mockResolvedValueOnce([
            {
                index: 0,
                centerFreq: 60,
                gain: 500,
                minGain: -1500,
                maxGain: 1500,
            },
            {
                index: 1,
                centerFreq: 230,
                gain: -200,
                minGain: -1500,
                maxGain: 1500,
            },
        ]); // applyPreset 回读
    engine.eqGetPresets.mockResolvedValueOnce(['Rock']);
    const config = makeConfig();
    const fx = new AudioEffect({ config });
    await fx.setup();

    await fx.applyEqualizerPreset('Rock');
    expect(engine.eqUsePreset).toHaveBeenCalledWith('Rock');
    expect(atomStore.get(equalizerGainsAtom)).toEqual([500, -200]);
    expect(atomStore.get(equalizerPresetAtom)).toBe('Rock');
    expect(config.get('audioEffect.eqPreset')).toBe('Rock');
    expect(atomStore.get(equalizerEnabledAtom)).toBe(true);
});

test('未知预设名 → 忽略（不写原生、不改态）', async () => {
    engine.eqGetBands.mockResolvedValue(BANDS);
    engine.eqGetPresets.mockResolvedValue(['Rock']);
    const fx = new AudioEffect({ config: makeConfig() });
    await fx.setup();

    await fx.applyEqualizerPreset('Nonexistent');
    expect(engine.eqUsePreset).not.toHaveBeenCalled();
    expect(atomStore.get(equalizerPresetAtom)).toBeNull();
});

test('套预设回读段数异常 → 不提交预设名与增益', async () => {
    engine.eqGetBands
        .mockResolvedValueOnce(BANDS) // setup
        .mockResolvedValueOnce([]); // 回读异常
    engine.eqGetPresets.mockResolvedValueOnce(['Rock']);
    const config = makeConfig();
    const fx = new AudioEffect({ config });
    await fx.setup();

    await fx.applyEqualizerPreset('Rock');
    expect(atomStore.get(equalizerPresetAtom)).toBeNull();
    expect(config.get('audioEffect.eqPreset')).toBeUndefined();
});

test('预设回读期间被手动编辑抢先 → 丢弃回读结果', async () => {
    engine.eqGetBands.mockResolvedValueOnce(BANDS); // setup
    engine.eqGetPresets.mockResolvedValueOnce(['Rock']);
    const fx = new AudioEffect({ config: makeConfig() });
    await fx.setup();

    let resolveReadback: (b: EqBand[]) => void = () => {};
    engine.eqGetBands.mockReturnValueOnce(
        new Promise<EqBand[]>(res => {
            resolveReadback = res;
        }),
    );
    const pending = fx.applyEqualizerPreset('Rock');
    await fx.setEqualizerBandGain(0, 700); // 手动编辑抢先，editSeq++
    resolveReadback([
        { index: 0, centerFreq: 60, gain: 500, minGain: -1500, maxGain: 1500 },
        { index: 1, centerFreq: 230, gain: 500, minGain: -1500, maxGain: 1500 },
    ]);
    await pending;

    expect(atomStore.get(equalizerPresetAtom)).toBeNull();
    expect(atomStore.get(equalizerGainsAtom)[0]).toBe(700);
});

test('套预设后显式关闭 → 保持关闭（乐观开启不覆盖后发关闭）', async () => {
    engine.eqGetBands.mockResolvedValueOnce(BANDS); // setup
    engine.eqGetPresets.mockResolvedValueOnce(['Rock']);
    const config = makeConfig();
    const fx = new AudioEffect({ config });
    await fx.setup();

    let resolveReadback: (b: EqBand[]) => void = () => {};
    engine.eqGetBands.mockReturnValueOnce(
        new Promise<EqBand[]>(res => {
            resolveReadback = res;
        }),
    );
    const pending = fx.applyEqualizerPreset('Rock');
    // 选预设应在同一节拍（await 回读前）已翻开开关
    expect(atomStore.get(equalizerEnabledAtom)).toBe(true);
    await fx.setEqualizerEnabled(false); // 回读期间用户显式关闭
    resolveReadback(BANDS);
    await pending;

    expect(atomStore.get(equalizerEnabledAtom)).toBe(false);
    expect(config.get('audioEffect.eqEnabled')).toBe(false);
    expect(atomStore.get(equalizerPresetAtom)).toBe('Rock'); // 曲线仍记录，只是被旁路
});

test('重置：各段归零 + 转自定义 + 开关不变', async () => {
    engine.eqGetBands.mockResolvedValue(BANDS);
    engine.eqGetPresets.mockResolvedValue(['Rock']);
    const config = makeConfig({
        'audioEffect.eqEnabled': false,
        'audioEffect.eqGains': [600, -300],
        'audioEffect.eqPreset': 'Rock',
    });
    const fx = new AudioEffect({ config });
    await fx.setup();
    expect(atomStore.get(equalizerPresetAtom)).toBe('Rock');

    await fx.resetEqualizer();
    expect(atomStore.get(equalizerGainsAtom)).toEqual([0, 0]);
    expect(atomStore.get(equalizerPresetAtom)).toBeNull();
    expect(atomStore.get(equalizerEnabledAtom)).toBe(false);
});

test('系统预设含 Flat → 过滤掉（与中性 / 自定义等价、不作可选项）', async () => {
    engine.eqGetBands.mockResolvedValue(BANDS);
    engine.eqGetPresets.mockResolvedValue(['Normal', 'Flat', 'Rock']);
    await new AudioEffect({ config: makeConfig() }).setup();
    expect(atomStore.get(equalizerPresetsAtom)).toEqual(['Normal', 'Rock']);
});

test('不可用时动作为空操作（不写原生）', async () => {
    engine.eqGetBands.mockResolvedValue([]);
    const fx = new AudioEffect({ config: makeConfig() });
    await fx.setup();

    await fx.setEqualizerEnabled(true);
    await fx.setEqualizerBandGain(0, 500);
    await fx.applyEqualizerPreset('Rock');
    expect(engine.eqSetEnabled).not.toHaveBeenCalled();
    expect(engine.eqSetBandGain).not.toHaveBeenCalled();
    expect(engine.eqUsePreset).not.toHaveBeenCalled();
});
