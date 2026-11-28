package `fun`.upup.musicfree.tags

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import `fun`.upup.musicfree.specs.NativeAudioTagsSpec
import `fun`.upup.musicfree.audiotags.AudioTagStore
import `fun`.upup.musicfree.audiotags.CoverEdit
import `fun`.upup.musicfree.audiotags.TagReadResult
import `fun`.upup.musicfree.audiotags.TagStatus
import `fun`.upup.musicfree.audiotags.TagWritePatch
import java.util.concurrent.Executors

/**
 * 音频 tag 读写 TurboModule：薄适配 RN-free 的 AudioTagStore
 * 每个 Promise 方法 dispatch 到后台线程（不阻塞 RN 线程）；错误在带内（结果 status），异常兜底 reject
 * NativeAudioTagsSpec 由 codegen 生成（javaPackageName=...audio），首次 build 后才存在
 */
@ReactModule(name = NativeAudioTagsModule.NAME)
class NativeAudioTagsModule(reactContext: ReactApplicationContext) :
    NativeAudioTagsSpec(reactContext) {

    private val store = AudioTagStore.get(reactContext)
    private val executor = Executors.newFixedThreadPool(maxOf(2, store.readConcurrency))

    override fun readTags(fileLocation: String, promise: Promise) = dispatch(promise) {
        val r = store.readTags(fileLocation)
        snapshotMap(r.errorCode, r)
    }

    override fun readTagsBatch(fileLocations: ReadableArray, promise: Promise) = dispatch(promise) {
        val list = toStringArray(fileLocations).toList()
        val results = store.readTagsBatch(list)
        Arguments.createArray().apply {
            results.forEach { pushMap(snapshotMap(it.errorCode, it)) }
        }
    }

    override fun writeTags(fileLocation: String, patch: ReadableMap, promise: Promise) = dispatch(promise) {
        val parsed = try {
            toPatch(patch)
        } catch (_: Exception) {
            // 任何 patch 解组失败（类型不符 / 非法 cover op）→ 带内 INVALID_ARG，不 reject
            return@dispatch snapshotMap(TagStatus.INVALID_ARG, null)
        }
        val w = store.writeTags(fileLocation, parsed)
        snapshotMap(w.status, w.snapshot)
    }

    override fun extractPrimaryCover(fileLocation: String, destPath: String, promise: Promise) =
        dispatch(promise) {
            val res = store.extractPrimaryCover(fileLocation, destPath)
            Arguments.createMap().apply {
                putInt("status", res.status)
                putString("path", res.file?.path ?: "")
                putString("mime", res.file?.mime ?: "")
                putInt("byteCount", res.file?.byteCount ?: 0)
            }
        }

    // —— 编排：后台执行 + 异常兜底 ——

    override fun invalidate() {
        executor.shutdown()
        super.invalidate()
    }

    private fun dispatch(promise: Promise, block: () -> Any) {
        executor.execute {
            try {
                promise.resolve(block())
            } catch (e: Exception) {
                promise.reject("E_TAG", e.message, e)
            }
        }
    }

    // —— ReadableMap/Array ↔ 引擎类型 ——

    private fun toPatch(map: ReadableMap): TagWritePatch {
        val setFields = HashMap<String, Array<String>>()
        map.getMap("setFields")?.let { sf ->
            val keys = sf.keySetIterator()
            while (keys.hasNextKey()) {
                val k = keys.nextKey()
                setFields[k] = toStringArray(sf.getArray(k))
            }
        }
        val removeFields = toStringArray(map.getArray("removeFields"))
        val cover = map.getMap("cover")
        val coverEdit = when (val op = cover?.getString("op")) {
            null, "unchanged" -> CoverEdit.Unchanged
            "remove" -> CoverEdit.Remove
            "replace" -> CoverEdit.Replace(
                cover.getString("imagePath")
                    ?: throw IllegalArgumentException("cover replace requires imagePath"),
            )
            else -> throw IllegalArgumentException("unknown cover op: $op")
        }
        return TagWritePatch(setFields, removeFields, coverEdit)
    }

    private fun toStringArray(arr: ReadableArray?): Array<String> {
        if (arr == null) return emptyArray()
        return Array(arr.size()) { arr.getString(it) ?: "" }
    }

    private fun snapshotMap(status: Int, r: TagReadResult?): WritableMap = Arguments.createMap().apply {
        putInt("status", status)
        val fields = Arguments.createMap()
        r?.fields?.forEach { (k, values) ->
            fields.putArray(
                k,
                Arguments.createArray().apply { values.forEach { pushString(it) } },
            )
        }
        putMap("fields", fields)
        val audio = r?.audio
        putDouble("durationMs", (audio?.durationMs ?: 0L).toDouble())
        putDouble("bitrateKbps", (audio?.bitrateKbps ?: 0L).toDouble())
        putDouble("sampleRateHz", (audio?.sampleRateHz ?: 0L).toDouble())
        putInt("channels", audio?.channels ?: 0)
        putBoolean("hasCoverArt", r?.hasCoverArt ?: false)
    }

    companion object {
        const val NAME = "NativeAudioTags"
    }
}
