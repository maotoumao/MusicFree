import { decodeBase64 } from './base64';

function toText(bytes: Uint8Array): string {
    return String.fromCharCode(...bytes);
}

describe('decodeBase64', () => {
    it.each([
        ['', ''],
        ['TQ==', 'M'],
        ['TWE=', 'Ma'],
        ['TWFu', 'Man'],
        ['TWFuTQ==', 'ManM'],
    ])('解出定长与带填充的输入 %#', (encoded, expected) => {
        expect(toText(decodeBase64(encoded))).toBe(expected);
    });

    it('跳过分块编码器插入的空白', () => {
        expect(toText(decodeBase64('TW\nFu\r\n'))).toBe('Man');
    });

    it('遇填充符即结束，不把后面的内容拼进来', () => {
        expect(toText(decodeBase64('TQ==TWFu'))).toBe('M');
    });

    it('非法字符直接抛错，不静默错位', () => {
        // 静默跳过会把损坏输入解成一串看似合理的字节，比失败更难查
        expect(() => decodeBase64('TQ*A')).toThrow(RangeError);
    });

    it('保留高位字节，不按文本截断', () => {
        expect([...decodeBase64('//79')]).toEqual([0xff, 0xfe, 0xfd]);
    });

    it('输入被截断时解出已凑齐的前缀', () => {
        // 只读了文件头几个字节时会出现这种残片，仍要能解出前缀而不是整段作废
        expect([...decodeBase64('//7')]).toEqual([0xff, 0xfe]);
    });
});
