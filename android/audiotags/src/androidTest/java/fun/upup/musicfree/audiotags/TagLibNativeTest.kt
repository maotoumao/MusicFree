package `fun`.upup.musicfree.audiotags

import android.os.ParcelFileDescriptor
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * TagLibNative 端到端：合成一个最小合法 WAV（无需二进制资产），走 fd 读/写/回读/封面
 * fd 契约：每次调用用 pfd.dup().detachFd() 交一个独立 fd，native 用完关闭
 */
@RunWith(AndroidJUnit4::class)
class TagLibNativeTest {

    private val cacheDir: File
        get() = InstrumentationRegistry.getInstrumentation().targetContext.cacheDir

    /** 写一个最小合法 PCM WAV（TagLib 支持 RIFF/WAV，tag 走内嵌 ID3v2） */
    private fun writeMinimalWav(file: File, sampleRate: Int = 44100, channels: Int = 1) {
        val bits = 16
        val dataSamples = 4410 // 0.1s
        val dataSize = dataSamples * channels * (bits / 8)
        val byteRate = sampleRate * channels * (bits / 8)
        val blockAlign = channels * (bits / 8)
        val buf = ByteBuffer.allocate(44 + dataSize).order(ByteOrder.LITTLE_ENDIAN)
        buf.put("RIFF".toByteArray(Charsets.US_ASCII))
        buf.putInt(36 + dataSize)
        buf.put("WAVE".toByteArray(Charsets.US_ASCII))
        buf.put("fmt ".toByteArray(Charsets.US_ASCII))
        buf.putInt(16)
        buf.putShort(1) // PCM
        buf.putShort(channels.toShort())
        buf.putInt(sampleRate)
        buf.putInt(byteRate)
        buf.putShort(blockAlign.toShort())
        buf.putShort(bits.toShort())
        buf.put("data".toByteArray(Charsets.US_ASCII))
        buf.putInt(dataSize)
        // data 全 0（静音）
        file.writeBytes(buf.array())
    }

    /** 每次新开独立 OFD 并 detach，native 接管并关闭 */
    private fun openFd(file: File): Int =
        ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_WRITE).detachFd()

    private fun freshWav(name: String): File = File(cacheDir, name).also { writeMinimalWav(it) }

    @Test
    fun read_write_tags_and_cover() {
        val wav = freshWav("m2a_rw.wav")

        // 读：Ok + 技术属性
        val read0 = TagLibNative.readTags(openFd(wav))
        assertEquals(TagLibNative.OK, read0.errorCode)
        assertEquals(44100L, read0.audio.sampleRateHz)
        assertEquals(1, read0.audio.channels)

        // 写文本 tag
        val w = TagLibNative.writeTags(
            openFd(wav),
            mapOf("TITLE" to arrayOf("Hello M2a"), "ARTIST" to arrayOf("MusicFree")),
            emptyArray(),
            TagLibNative.COVER_UNCHANGED, null, null,
        )
        assertEquals(TagLibNative.OK, w)

        // 回读文本
        val read1 = TagLibNative.readTags(openFd(wav))
        assertEquals(TagLibNative.OK, read1.errorCode)
        assertNotNull("回读 keys=${read1.fields.keys.joinToString()}", read1.fields["TITLE"])
        assertArrayEquals(arrayOf("Hello M2a"), read1.fields["TITLE"])
        assertArrayEquals(arrayOf("MusicFree"), read1.fields["ARTIST"])

        // 写封面
        val coverBytes = byteArrayOf(1, 2, 3, 4, 5)
        val wc = TagLibNative.writeTags(
            openFd(wav), emptyMap(), emptyArray(),
            TagLibNative.COVER_REPLACE, coverBytes, "image/jpeg",
        )
        assertEquals(TagLibNative.OK, wc)

        // 读封面
        val cover = TagLibNative.readPrimaryCover(openFd(wav))
        assertEquals(TagLibNative.OK, cover.errorCode)
        assertNotNull(cover.cover)
        assertArrayEquals(coverBytes, cover.cover!!.data)
        assertEquals("image/jpeg", cover.cover!!.mime)

        // 封面写不应抹掉之前的文本 tag
        val read2 = TagLibNative.readTags(openFd(wav))
        assertArrayEquals(arrayOf("Hello M2a"), read2.fields["TITLE"])
        assertTrue(read2.hasCoverArt)
    }

    /** 验证 UTF-16 转换：含 4 字节 emoji + 中文的标题应无损往返 */
    @Test
    fun emoji_and_cjk_roundtrip() {
        val wav = freshWav("m2a_emoji.wav")
        val title = "🎵 遇见 café 𝄞"
        val w = TagLibNative.writeTags(
            openFd(wav), mapOf("TITLE" to arrayOf(title)), emptyArray(),
            TagLibNative.COVER_UNCHANGED, null, null,
        )
        assertEquals(TagLibNative.OK, w)
        val read = TagLibNative.readTags(openFd(wav))
        assertArrayEquals(arrayOf(title), read.fields["TITLE"])
    }

    @Test
    fun write_noop_returns_ok() {
        val wav = freshWav("m2a_noop.wav")
        val r = TagLibNative.writeTags(
            openFd(wav), emptyMap(), emptyArray(),
            TagLibNative.COVER_UNCHANGED, null, null,
        )
        assertEquals(TagLibNative.OK, r)
    }

    @Test
    fun cover_replace_without_data_is_invalid_arg() {
        val wav = freshWav("m2a_badcover.wav")
        val r = TagLibNative.writeTags(
            openFd(wav), emptyMap(), emptyArray(),
            TagLibNative.COVER_REPLACE, null, "image/jpeg",
        )
        assertEquals(TagLibNative.INVALID_ARG, r)
    }

    @Test
    fun invalid_cover_op_is_invalid_arg() {
        val wav = freshWav("m2a_badop.wav")
        val r = TagLibNative.writeTags(
            openFd(wav), mapOf("TITLE" to arrayOf("x")), emptyArray(),
            99, null, null,
        )
        assertEquals(TagLibNative.INVALID_ARG, r)
    }

    @Test
    fun cover_absent_returns_ok_and_null() {
        val wav = freshWav("m2a_nocover.wav")
        val cover = TagLibNative.readPrimaryCover(openFd(wav))
        assertEquals(TagLibNative.OK, cover.errorCode)
        assertNull(cover.cover)
    }

    @Test
    fun read_bogus_is_unsupported() {
        val bogus = File(cacheDir, "m2a_bogus.bin")
        bogus.writeBytes(ByteArray(64) { 0x7A })
        val r = TagLibNative.readTags(openFd(bogus))
        assertEquals(TagLibNative.UNSUPPORTED, r.errorCode)
    }
}
