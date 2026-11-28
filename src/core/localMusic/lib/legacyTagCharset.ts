import type { Locale } from '@/i18n';

/**
 * 旧标签乱码修复该用哪张码表（纯计算）
 *
 * 一小部分老 MP3 的 ID3 标签里写的是本地码页字节（GBK / Big5），编码字节却声明成
 * ISO-8859-1。TagLib 按声明解，于是「周杰伦 - 稻香」扫出来是「ÖÜ½ÜÂ× - µ¾Ïã」。
 * 修复要用哪张码表**无法从字节判断**——同一串 GBK 字节按 Big5 解也「成功」，
 * 只是解出一堆错字（实测：`ÖÜ½ÜÂ×` 按 Big5 得「笚豌豐」）。故只能按用户语言选。
 *
 * **不认识的语言一律返回空串、不修复**：这是刻意保守。用错码表会把「可辨认的乱码」
 * 变成「看起来像真数据的错字」，那比不修更糟——乱码至少在喊「我编码坏了」。
 *
 * 已知边界：
 * - 简中用户的 Big5 文件仍会被按 GBK 解成错字（反之同理）。这种交叉情形无法靠算法
 *   分辨，且相对罕见，不为它引入字频表。EUC-KR / EUC-JP 的汉字同理。
 * - **返回 BIG5 只表示「策略选了它」，不代表繁中已被覆盖**：原生侧的形状判据要求
 *   双字节都 ≥0xA1，而 Big5 常用字的 trail 多在 0x40–0x7E：按字算 40.6% 修不了，
 *   而判据整串一票否决，**按标签算 2 字标题约 65%、3 字约 79%**（`周杰倫`/`稻香`/`蔡依林`
 *   都在内）。详见 Kotlin LegacyTagText.CJK_BYTE_FLOOR
 */
export function legacyTagCharsetFor(locale: Locale): string {
    switch (locale) {
        case 'zh-CN':
            return 'GBK';
        case 'zh-TW':
            return 'BIG5';
        default:
            return '';
    }
}
