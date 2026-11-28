package `fun`.upup.musicfree.audiotags

import android.os.ParcelFileDescriptor

/** 音频技术属性，单位随名 */
data class AudioProps(
    val durationMs: Long,
    val bitrateKbps: Long,
    val sampleRateHz: Long,
    val channels: Int,
)

/** JNI 直接构造的读结果：字段用平行数组编组，便于 JNI 侧组装（模块内部实现细节） */
internal class NativeTagResult(
    @JvmField val errorCode: Int,
    @JvmField val keys: Array<String>,
    @JvmField val values: Array<Array<String>>,
    @JvmField val audio: AudioProps,
    @JvmField val hasCoverArt: Boolean,
)

/** 读结果：错误码 + 大写 key 的多值字段 + 技术属性 + 是否含封面 */
data class TagReadResult(
    val errorCode: Int,
    val fields: Map<String, Array<String>>,
    val audio: AudioProps,
    val hasCoverArt: Boolean,
)

/** 单张封面字节 */
class CoverBytes(
    @JvmField val data: ByteArray,
    @JvmField val mime: String,
    @JvmField val description: String,
)

/** 封面读结果：错误码 + 封面（null = Ok 且无封面，或读失败见 errorCode） */
class CoverReadResult(
    @JvmField val errorCode: Int,
    @JvmField val cover: CoverBytes?,
)

/**
 * TagLib 的薄 JNI 绑定：只吃 int fd，零 RN 依赖
 * fd 契约：传入的 fd 由本层「必然消费」——正常走 native 接管并关闭；早失败时本层关闭。调用方 detach 后不得再 close
 */
object TagLibNative {
    init {
        System.loadLibrary("audiotags")
    }

    // 封面写操作（与 C++ musicfree::tags::CoverOp 序号一致）
    const val COVER_UNCHANGED = 0
    const val COVER_REMOVE = 1
    const val COVER_REPLACE = 2

    // 错误码（与 C++ musicfree::tags::ErrorCode 序号一致）
    const val OK = 0
    const val NOT_OPEN = 1
    const val UNSUPPORTED = 2
    const val FIELDS_REJECTED = 3
    const val IO = 4
    const val INVALID_ARG = 5

    /** 只读打开，读 tag 与技术属性 */
    fun readTags(fd: Int): TagReadResult {
        val n = nativeReadTags(fd)
            ?: return TagReadResult(IO, emptyMap(), AudioProps(0, 0, 0, 0), false)
        val fields = LinkedHashMap<String, Array<String>>(n.keys.size)
        for (i in n.keys.indices) {
            fields[n.keys[i]] = n.values[i]
        }
        return TagReadResult(n.errorCode, fields, n.audio, n.hasCoverArt)
    }

    /** 只读打开，取主封面（Front Cover 优先，否则第一张） */
    fun readPrimaryCover(fd: Int): CoverReadResult {
        return nativeReadPrimaryCover(fd) ?: CoverReadResult(IO, null)
    }

    /** 读写打开（fd 须 O_RDWR），按需写文本字段与封面；返回错误码 */
    fun writeTags(
        fd: Int,
        setFields: Map<String, Array<String>>,
        removeFields: Array<String>,
        coverOp: Int,
        cover: ByteArray?,
        coverMime: String?,
    ): Int {
        val keys: Array<String>
        val values: Array<Array<String>>
        try {
            // 先快照，避免并发修改 / 迭代器与 size 不一致
            val entries = setFields.entries.toList()
            keys = Array(entries.size) { entries[it].key }
            values = Array(entries.size) { entries[it].value }
        } catch (t: Throwable) {
            // 摊数组失败发生在 native 接管 fd 之前，本层负责关闭防泄漏
            closeFdQuietly(fd)
            throw t
        }
        return nativeWriteTags(fd, keys, values, removeFields, coverOp, cover, coverMime)
    }

    private fun closeFdQuietly(fd: Int) {
        try {
            ParcelFileDescriptor.adoptFd(fd).close()
        } catch (_: Throwable) {
            // 尽力关闭，忽略
        }
    }

    private external fun nativeReadTags(fd: Int): NativeTagResult?

    private external fun nativeReadPrimaryCover(fd: Int): CoverReadResult?

    private external fun nativeWriteTags(
        fd: Int,
        setKeys: Array<String>,
        setValues: Array<Array<String>>,
        removeFields: Array<String>,
        coverOp: Int,
        cover: ByteArray?,
        coverMime: String?,
    ): Int
}
