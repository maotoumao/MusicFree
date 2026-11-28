import { legacyTagCharsetFor } from './legacyTagCharset';

import type { Locale } from '@/i18n';

describe('旧标签码表按语言选', () => {
    it('简体中文用 GBK', () => {
        expect(legacyTagCharsetFor('zh-CN')).toBe('GBK');
    });

    /*
     * 注意这条只钉「策略选了 BIG5」，**不代表繁中已被覆盖**：
     * 原生侧的形状判据要求双字节都 ≥0xA1，而 Big5 常用字的 trail 多在 0x40–0x7E，
     * 实测 40.6% 的 Big5 汉字因此修不了。别把这条测试读成「zh-TW 能用了」
     */
    it('繁体中文选 BIG5（仅策略，覆盖面见 LegacyTagText 注释）', () => {
        expect(legacyTagCharsetFor('zh-TW')).toBe('BIG5');
    });

    /*
     * 这条是本函数存在的全部意义：**宁可不修，也不能用错码表**。
     * 用错码表会把「可辨认的乱码」变成「看起来像真数据的错字」，
     * 而乱码至少在明示「这里编码坏了」
     */
    it('其余语言一律不修复（空串），不拿 GBK 去赌', () => {
        expect(legacyTagCharsetFor('en-US')).toBe('');
    });

    it('两种中文取的码表必须不同——否则繁中用户会被按简中解成错字', () => {
        expect(legacyTagCharsetFor('zh-CN')).not.toBe(
            legacyTagCharsetFor('zh-TW'),
        );
    });

    it('返回值只能是原生侧认得的码表名或空串', () => {
        const locales: Locale[] = ['zh-CN', 'zh-TW', 'en-US'];
        for (const locale of locales) {
            expect(['GBK', 'BIG5', '']).toContain(legacyTagCharsetFor(locale));
        }
    });
});
