package `fun`.upup.musicfree.download

import java.io.File
import java.io.RandomAccessFile

/**
 * 容器嗅探（A2）：读取音频文件头的 magic bytes，识别真实容器并映射到扩展名
 *
 * 覆盖本地库允许的音频格式：mp3 / flac / m4a / aac / wav / ogg / opus / ape / wma。
 * 含前置 ID3v2 时按 mp3 回退
 *
 * 结果是三态而非「扩展名 / null」两态，因为「认不出」与「这根本不是音频」要区别对待：
 * 前者可能是本嗅探器没覆盖的冷门容器，得放行；后者（服务端 200 却返回错误页 / 风控 JSON）
 * 必须拦在发布之前，否则会存成一个扩展名为 mp3、内容是文本的假音频
 *
 * 注意这道闸只挡得住**文本**，不是通用的「是不是音频」校验：图片 / 视频仍会落入 Unknown 而被放行
 *
 * ID3v2 是前置元数据而非容器标识（FLAC / APE 也可能带 ID3v2），因此必须先跳过整个 tag，再嗅探真实文件头
 *
 * magic 依据（均经权威核对）：
 * - fLaC：xiph FLAC 规范（0x66,4C,61,43）
 * - ftyp@4：ISO-BMFF box header（前 4 字节 size、次 4 字节 box 名）→ MP4/M4A
 * - OggS + OpusHead / 否则 Ogg：Ogg 封装（包括 Vorbis）
 * - RIFF…WAVE：WAVE 规范
 * - MPEG 帧同步 + layer 位：区分 MP3（Layer III）与 ADTS AAC（layer 00）
 * - MAC␠：Monkey's Audio；ASF header GUID：WMA
 */
object ContainerSniffer {

    /** 嗅探结论 */
    sealed interface Sniff {
        /**
         * 认出了已知容器
         * 只代表容器头匹配，未校验里面真有音轨——ISO-BMFF 这类壳子（m4a / mp4 / heif）共用同一 magic
         */
        data class Audio(val ext: String) : Sniff
        /** 明确不是音频（头部是文本：JSON / HTML / 纯文本提示） */
        data object NotAudio : Sniff
        /** 认不出——可能是本嗅探器没覆盖的容器，由调用方按 Content-Type / URL 回退 */
        data object Unknown : Sniff
    }

    /** 读取足以覆盖 ftyp@4、RIFF…WAVE@8 以及 Ogg 首页 OpusHead（约 28 字节）的头部字节数 */
    private const val HEADER_BYTES = 64

    /** 嗅探文件容器；前置 ID3v2 路径按 mp3 回退，读不到内容按 Unknown 处理（交回退链决定） */
    fun sniff(file: File): Sniff {
        val head = readAt(file, 0, HEADER_BYTES) ?: return Sniff.Unknown
        // 跳过前置 ID3v2 的整个 tag 后再嗅探真实文件头；无法解析或读取 tag 时按 mp3 回退
        if (matchAt(head, 0, 0x49, 0x44, 0x33)) {
            val tagSize = id3v2TotalSize(head) ?: return Sniff.Audio("mp3")
            val inner = readAt(file, tagSize, HEADER_BYTES) ?: return Sniff.Audio("mp3")
            return Sniff.Audio(detectContainer(inner) ?: "mp3") // 跳过 tag 后仍无法识别时按 mp3 回退
        }
        detectContainer(head)?.let { return Sniff.Audio(it) }
        return if (looksLikeText(head)) Sniff.NotAudio else Sniff.Unknown
    }

    /**
     * 头部是否明显是文本：把「HTTP 200 但返回错误页 / 风控 JSON」挡在发布之前
     *
     * 只做负向判定，且只在所有已知容器都没匹配上之后才问它——认不出的二进制一律放行，
     * 宁可偶尔存错扩展名，也不能误杀一首合法但格式冷门的歌
     */
    private fun looksLikeText(b: ByteArray): Boolean {
        val start = if (matchAt(b, 0, 0xEF, 0xBB, 0xBF)) 3 else 0 // 跳过 UTF-8 BOM
        var i = start
        while (i < b.size && isAsciiSpace(b[i])) i++
        if (i >= b.size) return true // 读到的全是 BOM / 空白，同样不可能是音频
        // JSON / HTML / XML：没有任何音频容器以这三个字符开头
        when (b[i].toInt() and 0xFF) {
            0x7B, 0x5B, 0x3C -> return true // '{' '[' '<'
        }
        // 整段头部都可打印 → 纯文本提示（此时已排除全部可识别容器）
        // 从 start 起算：BOM 自身不是可打印 ASCII，连它一起检查会把带 BOM 的文本放过去
        for (j in start until b.size) {
            if (!isAsciiPrintable(b[j]) && !isAsciiSpace(b[j])) return false
        }
        return true
    }

    private fun isAsciiSpace(x: Byte): Boolean =
        (x.toInt() and 0xFF).let { it == 0x20 || it == 0x09 || it == 0x0A || it == 0x0D }

    private fun isAsciiPrintable(x: Byte): Boolean = (x.toInt() and 0xFF) in 0x20..0x7E

    /** 识别容器（不处理前置 ID3v2，供跳过 tag 后复用） */
    private fun detectContainer(b: ByteArray): String? {
        if (b.size < 4) return null

        if (matchAt(b, 0, 0x66, 0x4C, 0x61, 0x43)) return "flac" // "fLaC"
        if (matchAt(b, 0, 0x4F, 0x67, 0x67, 0x53)) { // "OggS"
            return if (containsAscii(b, "OpusHead")) "opus" else "ogg"
        }
        // RIFF....WAVE：WAVE 标识位于偏移 8
        if (b.size >= 12 && matchAt(b, 0, 0x52, 0x49, 0x46, 0x46) && matchAt(b, 8, 0x57, 0x41, 0x56, 0x45)) return "wav"
        // ....ftyp：ISO-BMFF box 名位于偏移 4；音频下载场景统一记为 m4a
        if (b.size >= 8 && matchAt(b, 4, 0x66, 0x74, 0x79, 0x70)) return "m4a"
        if (matchAt(b, 0, 0x4D, 0x41, 0x43, 0x20)) return "ape" // "MAC "
        // ASF header object GUID 前缀 → WMA
        if (matchAt(b, 0, 0x30, 0x26, 0xB2, 0x75, 0x8E, 0x66, 0xCF, 0x11)) return "wma"

        // MPEG 音频帧同步：byte0 = 0xFF，且 byte1 高 3 位 sync 全为 1，组成 11 位 sync
        // byte1 的 version 与 layer 位用于区分格式：ADTS AAC 的 layer == 00，MP3 为 Layer III（layer == 01）
        if (b.size >= 2 && (b[0].toInt() and 0xFF) == 0xFF) {
            val b1 = b[1].toInt() and 0xFF
            if (b1 and 0xE0 == 0xE0) {
                // ADTS AAC：top 4 位为 1111 且 layer（bits 2-1）== 00；(b1 & 0xF6) == 0xF0，兼容带/不带 CRC
                if (b1 and 0xF6 == 0xF0) return "aac"
                // MP3：Layer III，即 layer（bits 2-1）== 01；version（bits 4-3）不能为保留值 01
                if (b1 and 0x06 == 0x02 && b1 and 0x18 != 0x08) return "mp3"
            }
        }
        return null
    }

    /**
     * 解析 ID3v2 头（10 字节：`ID3` + 主/次版本 + flags + synchsafe size4），返回整个 tag 占用的字节数
     * 版本非法，或 size 字节的高位非 0（即不是 synchsafe size）时返回 null
     */
    private fun id3v2TotalSize(head: ByteArray): Long? {
        if (head.size < 10) return null
        if ((head[3].toInt() and 0xFF) == 0xFF) return null // 主版本非法
        for (i in 6..9) if ((head[i].toInt() and 0x80) != 0) return null // 非 synchsafe
        val size = ((head[6].toInt() and 0x7F) shl 21) or
            ((head[7].toInt() and 0x7F) shl 14) or
            ((head[8].toInt() and 0x7F) shl 7) or
            (head[9].toInt() and 0x7F)
        val footer = if ((head[5].toInt() and 0x10) != 0) 10 else 0 // flags bit4：footer present 时追加 10 字节
        return (10 + size + footer).toLong()
    }

    /** 从 offset 处循环读取 n 字节；单次 read 可能少于请求长度，越界或无法读取时返回 null */
    private fun readAt(file: File, offset: Long, n: Int): ByteArray? =
        try {
            RandomAccessFile(file, "r").use { raf ->
                if (offset > 0) {
                    if (offset >= raf.length()) return null
                    raf.seek(offset)
                }
                val buf = ByteArray(n)
                var off = 0
                while (off < n) {
                    val r = raf.read(buf, off, n - off)
                    if (r < 0) break
                    off += r
                }
                when {
                    off == 0 -> null
                    off == n -> buf
                    else -> buf.copyOf(off)
                }
            }
        } catch (_: Exception) {
            null
        }

    /** 在 offset 处按无符号字节逐一比对 magic bytes */
    private fun matchAt(b: ByteArray, offset: Int, vararg sig: Int): Boolean {
        if (b.size < offset + sig.size) return false
        for (i in sig.indices) if ((b[offset + i].toInt() and 0xFF) != sig[i]) return false
        return true
    }

    /** 在 buffer 中查找 ASCII 子串，用于在 Ogg 封装中区分 Opus 与其他格式 */
    private fun containsAscii(haystack: ByteArray, needle: String): Boolean {
        val n = needle.toByteArray(Charsets.US_ASCII)
        if (n.isEmpty() || haystack.size < n.size) return false
        outer@ for (i in 0..haystack.size - n.size) {
            for (j in n.indices) if (haystack[i + j] != n[j]) continue@outer
            return true
        }
        return false
    }
}
