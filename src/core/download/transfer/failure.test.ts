import { failureReasonOf } from './failure';

describe('原生错误码 → 用户可见的失败原因', () => {
    it('网络与服务器分开：一个该换网络重试，一个该稍后再来', () => {
        expect(failureReasonOf('network')).toBe('network');
        expect(failureReasonOf('http')).toBe('server');
    });

    it('服务端返回的不是音频，归入「音源不可用」——与插件解析不出是同一句话', () => {
        expect(failureReasonOf('notAudio')).toBe('sourceUnavailable');
    });

    it('用户能直接处置的两种单列，不埋进未知错误', () => {
        expect(failureReasonOf('diskFull')).toBe('diskFull');
        expect(failureReasonOf('permission')).toBe('permission');
    });

    it('用户无从下手的内部错误一律归未知：分得再细也不改变他能做的事', () => {
        for (const code of [
            'io',
            'invalidRequest',
            'unsupported',
            'capacity',
            'targetExists',
            'finalize',
            'systemLimit',
            'unknown',
        ]) {
            expect(failureReasonOf(code)).toBe('unknown');
        }
    });

    it('认不出的码归未知，不抛也不漏——原生新增码时旧版本要还能用', () => {
        expect(failureReasonOf('somethingNewFromNative')).toBe('unknown');
        expect(failureReasonOf('')).toBe('unknown');
    });
});
