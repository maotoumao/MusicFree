package `fun`.upup.musicfree.mediaScanner

import java.nio.charset.Charset
import java.nio.charset.StandardCharsets

/**
 * 旧 ID3 标签的乱码修复
 *
 * 成因：一小部分老 MP3 的 ID3 标签里写的是本地码页字节（GBK / Big5），而文本帧的编码字节
 * 声明成 ISO-8859-1。TagLib 按声明解，于是「周杰伦 - 稻香」读出来是「ÖÜ½ÜÂ× - µ¾Ïã」。
 * 只有这一种情形会乱：ID3v2 正确声明 UTF-16/UTF-8 的、以及 FLAC / M4A / Ogg
 * （规范即 UTF-8）都不受影响。
 *
 * 能在这里修是因为 **ISO-8859-1 是 0x00–0xFF 的双射**，原始字节可以从乱码串里无损取回，
 * 不必改 TagLib。
 *
 * 用哪张码表由 JS 按应用语言给（见 core/localMusic/lib/legacyTagCharset）——
 * 码表无法从字节判断：同一串 GBK 字节按 Big5 解也「成功」，只是解出错字。
 */
object LegacyTagText {
    /**
     * 双字节码页里汉字区的字节下界；低于它的高位字节视为「不是这类乱码」
     *
     * **这道门槛让 Big5 分支实际上基本不生效**，不是「漏修一部分」：Big5 一级字区的
     * trail byte 落在 0x40–0x7E，实测 13061 个 Big5 可编码汉字里有 5300 个（40.6%）
     * 含 <0xA1 的字节，而且正是最常用的那批——`周杰倫`/`稻香`/`張惠妹`/`蔡依林`/`愛情`
     * 全都过不了判据（只有 `五月天`/`晴天` 这类恰好全高位的能修）。
     * 判据又是整串一票否决，一个低位字符就让整条标签放弃。
     *
     * 不放宽是因为没有便宜的修法：把 trail 放宽到 0x40–0x7E 会直接摧毁欧语防护——
     * `Björk` 的 0xF6 后面跟的正是 0x72，落在同一区间，字节层面无法区分。
     * 要不要为 zh-TW 单独放宽（代价是繁中用户的欧语标签可能被打坏）是产品决定，未做。
     *
     * 同一道门槛也挡掉了 GBK 自己的扩展区（如 `喆` = 86 B4、`啰嗦` = 86 AA E0 C2），
     * 含这类字的整条标签同样放弃修复。方向是保守的：退回乱码，而不是给出错字。
     */
    private const val CJK_BYTE_FLOOR = 0xA1

    /**
     * 至少要有**一段连续**这么多对，才认为是乱码
     *
     * 计「连续段」而不是计总对数：总对数会把分散的两组重音字母也算进来——
     * `Jää jää` 里两个 `E4 E4` 隔着 ASCII，总对数 2 却是正常芬兰语文本，
     * 按 GBK 解会变成 `J滗 j滗`。要求连续能把它挡住，代价是漏修
     * 「单个汉字与 ASCII 交替」这种乱码（如 `X稻Y香Z`），那种很少见
     */
    private const val MIN_RUN = 2

    /**
     * 像不像「本地码页字节被当 Latin-1 解」出来的乱码
     *
     * 三条都要满足，**不解码就能判**：
     * 1. 所有字符 ≤ U+00FF——有更大的码点说明已经是正确解出的 CJK，不该碰
     * 2. 非 ASCII 字节全部成对，且每对两个字节都 ≥ 0xA1
     * 3. 存在**连续**两对以上（ASCII 会打断连续段）
     *
     * 第 2 条是把欧语挡在外面的关键：真 Latin-1 文本里的重音字母是被 ASCII 夹着的
     * **孤立**高位字节（`Björk` 的 0xF6 后面跟着 `r`），而 GBK/Big5 汉字是连续成对的。
     *
     * 已知会误伤：**连续**四个及以上的重音字母（如芬兰语 `ÄäÖö`）满足全部三条，会被当乱码。
     * 注意必须是连续的——分散的两组（`Jää jää`）被第 3 条挡住了，那是最初漏掉的一类。
     * 现实里连续四个重音字母不作为歌名出现，但它是真实边界。
     */
    fun looksLikeLegacyMojibake(s: String): Boolean {
        if (s.isEmpty()) return false
        for (ch in s) {
            if (ch.code > 0xFF) return false
        }
        var i = 0
        var run = 0
        var maxRun = 0
        while (i < s.length) {
            val b = s[i].code
            if (b < 0x80) {
                // ASCII 打断连续段：分散的两组重音字母不该被拼成一次命中
                run = 0
                i += 1
                continue
            }
            val next = if (i + 1 < s.length) s[i + 1].code else -1
            if (b >= CJK_BYTE_FLOOR && next >= CJK_BYTE_FLOOR) {
                run += 1
                if (run > maxRun) maxRun = run
                i += 2
            } else {
                // 孤立高位字节：真 Latin-1 文本的特征，放过
                return false
            }
        }
        return maxRun >= MIN_RUN
    }

    /**
     * 不像乱码、码表为空、或该码表解不出来时**原样返回**
     *
     * @param charsetName JS 给的码表名（`GBK` / `BIG5`）；空串 = 不修
     */
    fun repair(s: String, charsetName: String): String {
        if (charsetName.isEmpty() || s.isEmpty()) return s
        // 有 >U+00FF 的码点说明已经是正确解出的文本，一律不碰
        for (ch in s) {
            if (ch.code > 0xFF) return s
        }
        // Latin-1 双射：把乱码串还原成原始字节
        val bytes = s.toByteArray(StandardCharsets.ISO_8859_1)
        // 先认「UTF-8 被误声明成 Latin-1」这一类，它必须排在本地码页之前——见下方函数注释
        decodeMislabeledUtf8(bytes)?.let { return it }
        if (!looksLikeLegacyMojibake(s)) return s
        val charset = charsetOrNull(charsetName) ?: return s
        val decoded = runCatching { String(bytes, charset) }.getOrNull() ?: return s
        // 解坏了（出现替换符）就别用——宁可留乱码，也不要拿一串问号覆盖
        return if (decoded.isEmpty() || decoded.contains('�')) s else decoded
    }

    /**
     * 认出「本该是 UTF-8、却被声明成 ISO-8859-1」的标签；不是这一类则返回 null
     *
     * 这一类真实存在：**ID3v2.3 的编码字节没有 UTF-8 这一档**（只有 0x00=ISO-8859-1 与
     * 0x01=UTF-16），有工具就把 UTF-8 字节塞进去、编码字节留 0x00。TagLib 按声明解，
     * 出来同样是一串 ≤U+00FF 的字符，同样会过下面那道成对判据。
     *
     * **必须排在本地码页之前**：不然「天空」（UTF-8 E5 A4 A9 E7 A9 BA）会被按 GBK 解成
     * 「澶╃┖」——把可辨认的乱码变成看起来像真数据的错字，正是本文件要避免的失败模式。
     * 而按 UTF-8 解出来就是正确的「天空」，所以这一支不只是护栏、它自己也修好一类文件。
     *
     * 闸门是「严格解得通 **且** 解出含 CJK 汉字」，这个组合是量过的：
     * 随机 5996 个真 GBK 双字词里，字节串恰好也是合法 UTF-8 的有 117 个（1.95%），
     * 但其中解出含 CJK 汉字的是 **0** 个。注意这只覆盖双字：三字及以上仍有约万分之一
     * 会被这一支抢走并解成错字（如 `槌寸焙` 的 GBK 字节恰好是合法 UTF-8）。
     * 没有更便宜的闸门，且失败方向与不修相当（两边都是错文本），故接受。
     * 若只要求「解出含 >U+00FF 字符」，那 117 个会被全部误路由（它们解成希伯来/阿拉伯字母）。
     *
     * 已知不覆盖：纯假名 / 纯谚文的误声明 UTF-8（不含 CJK 汉字）。本函数只服务
     * GBK / Big5 两张中文码表的语言档，那两档下这种标签不构成目标场景。
     */
    private fun decodeMislabeledUtf8(bytes: ByteArray): String? {
        val decoded = String(bytes, StandardCharsets.UTF_8)
        // String(bytes, charset) 不抛异常、非法序列替换成 U+FFFD；有替换符即解不通
        if (decoded.contains('\uFFFD')) return null
        // 必须真的是多字节序列（纯 ASCII 解出来长度不变，那不是这一类）
        if (decoded.length == bytes.size) return null
        return if (decoded.any { it.isCjkIdeograph() }) decoded else null
    }

    private fun Char.isCjkIdeograph(): Boolean = code in 0x4E00..0x9FFF

    /** 设备不认这张码表时返回 null（Android 各版本码表集合并不完全一致） */
    private fun charsetOrNull(name: String): Charset? =
        runCatching { Charset.forName(name) }.getOrNull()
}
