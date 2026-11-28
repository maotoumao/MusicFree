package `fun`.upup.musicfree.audiotags

import androidx.core.content.FileProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * AudioTagStore 端到端：path 与 content://（FileProvider fixture）两条来源
 */
@RunWith(AndroidJUnit4::class)
class AudioTagStoreTest {

    private val context = InstrumentationRegistry.getInstrumentation().context
    private val store by lazy { AudioTagStore(context) }

    private val authority = "fun.upup.musicfree.audiotags.test.fileprovider"

    private fun freshWav(name: String): File =
        File(context.cacheDir, name).also { writeMinimalWav(it) }

    private fun writeMinimalWav(file: File) {
        val sampleRate = 44100
        val channels = 1
        val bits = 16
        val dataSize = 4410 * channels * (bits / 8)
        val buf = ByteBuffer.allocate(44 + dataSize).order(ByteOrder.LITTLE_ENDIAN)
        buf.put("RIFF".toByteArray(Charsets.US_ASCII)); buf.putInt(36 + dataSize)
        buf.put("WAVE".toByteArray(Charsets.US_ASCII))
        buf.put("fmt ".toByteArray(Charsets.US_ASCII)); buf.putInt(16)
        buf.putShort(1); buf.putShort(channels.toShort()); buf.putInt(sampleRate)
        buf.putInt(sampleRate * channels * (bits / 8)); buf.putShort((channels * (bits / 8)).toShort()); buf.putShort(bits.toShort())
        buf.put("data".toByteArray(Charsets.US_ASCII)); buf.putInt(dataSize)
        file.writeBytes(buf.array())
    }

    private fun fakeJpeg(name: String): File =
        File(context.cacheDir, name).also {
            it.writeBytes(byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte(), 0x11, 0x22, 0xFF.toByte(), 0xD9.toByte()))
        }

    @Test
    fun extract_cover_to_source_path_is_rejected() {
        val wav = freshWav("s_same.wav")
        val path = wav.absolutePath
        // 先写入封面，确保有封面可提取
        val jpeg = fakeJpeg("cover_same.jpg")
        assertEquals(TagStatus.OK, store.writeTags(path, TagWritePatch(cover = CoverEdit.Replace(jpeg.absolutePath))).status)
        val before = wav.readBytes()

        // dest == 源音频路径 → 必须拒绝，且不得覆盖音频
        val ex = store.extractPrimaryCover(path, path)
        assertEquals(TagStatus.INVALID_ARG, ex.status)
        assertNull(ex.file)
        assertArrayEquals(before, wav.readBytes())
    }

    @Test
    fun path_read_write_cover_roundtrip() {
        val wav = freshWav("s_rw.wav")
        val path = wav.absolutePath

        val w = store.writeTags(path, TagWritePatch(setFields = mapOf("TITLE" to arrayOf("Store"), "ARTIST" to arrayOf("MF"))))
        assertEquals(TagStatus.OK, w.status)
        assertNotNull(w.snapshot)
        assertArrayEquals(arrayOf("Store"), w.snapshot!!.fields["TITLE"])

        val r = store.readTags(path)
        assertEquals(TagStatus.OK, r.errorCode)
        assertArrayEquals(arrayOf("MF"), r.fields["ARTIST"])

        // 写封面（图片走文件路径）
        val jpeg = fakeJpeg("cover.jpg")
        val wc = store.writeTags(path, TagWritePatch(cover = CoverEdit.Replace(jpeg.absolutePath)))
        assertEquals(TagStatus.OK, wc.status)

        // 提取封面到目标文件
        val dest = File(context.cacheDir, "extracted.jpg")
        val ex = store.extractPrimaryCover(path, dest.absolutePath)
        assertEquals(TagStatus.OK, ex.status)
        assertNotNull(ex.file)
        assertEquals("image/jpeg", ex.file!!.mime)
        assertArrayEquals(jpeg.readBytes(), dest.readBytes())

        // 文本 tag 未被封面写抹掉
        assertArrayEquals(arrayOf("Store"), store.readTags(path).fields["TITLE"])
    }

    @Test
    fun content_read_write_roundtrip() {
        val wav = freshWav("s_content.wav")
        val uri = FileProvider.getUriForFile(context, authority, wav).toString()

        val w = store.writeTags(uri, TagWritePatch(setFields = mapOf("TITLE" to arrayOf("ContentSrc"))))
        assertEquals(TagStatus.OK, w.status)

        val r = store.readTags(uri)
        assertEquals(TagStatus.OK, r.errorCode)
        assertArrayEquals(arrayOf("ContentSrc"), r.fields["TITLE"])
    }

    @Test
    fun batch_read() {
        val files = (0 until 5).map { i ->
            val f = freshWav("s_batch_$i.wav")
            store.writeTags(f.absolutePath, TagWritePatch(setFields = mapOf("TITLE" to arrayOf("T$i"))))
            f.absolutePath
        }
        val results = store.readTagsBatch(files)
        assertEquals(5, results.size)
        results.forEachIndexed { i, r ->
            assertEquals(TagStatus.OK, r.errorCode)
            assertArrayEquals(arrayOf("T$i"), r.fields["TITLE"])
        }
    }

    @Test
    fun read_missing_path_is_not_found() {
        val r = store.readTags(File(context.cacheDir, "does_not_exist.wav").absolutePath)
        assertEquals(TagStatus.NOT_FOUND, r.errorCode)
    }

    @Test
    fun extract_cover_absent_is_ok_null() {
        val wav = freshWav("s_nocover.wav")
        val ex = store.extractPrimaryCover(wav.absolutePath, File(context.cacheDir, "none.jpg").absolutePath)
        assertEquals(TagStatus.OK, ex.status)
        assertNull(ex.file)
    }

    @Test
    fun noop_write_does_not_change_file() {
        val wav = freshWav("s_noop.wav")
        store.writeTags(wav.absolutePath, TagWritePatch(setFields = mapOf("TITLE" to arrayOf("Keep"))))
        val before = wav.lastModified()
        Thread.sleep(20)
        val r = store.writeTags(wav.absolutePath, TagWritePatch())
        assertEquals(TagStatus.OK, r.status)
        assertArrayEquals(arrayOf("Keep"), r.snapshot!!.fields["TITLE"])
        assertEquals(before, wav.lastModified()) // 文件未被重写
    }

    @Test
    fun replace_cover_with_non_image_is_invalid_arg() {
        val wav = freshWav("s_badimg.wav")
        val notImage = File(context.cacheDir, "notimage.bin").apply { writeBytes(ByteArray(16) { 0x30 }) }
        val r = store.writeTags(wav.absolutePath, TagWritePatch(cover = CoverEdit.Replace(notImage.absolutePath)))
        assertEquals(TagStatus.INVALID_ARG, r.status)
    }
}
