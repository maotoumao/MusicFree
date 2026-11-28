package `fun`.upup.musicfree.download

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.module.annotations.ReactModule
import `fun`.upup.musicfree.specs.NativeDownloadEngineSpec
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * 下载引擎 TurboModule：将命令委托给 DownloadEngine，并把 Listener 事件转为 emitOnXxx 回传 JS
 * NativeDownloadEngineSpec 由 codegen 生成
 */
@ReactModule(name = NativeDownloadEngineModule.NAME)
class NativeDownloadEngineModule(private val reactContext: ReactApplicationContext) :
    NativeDownloadEngineSpec(reactContext), DownloadEngine.Listener {

    /** 维护类磁盘操作（孤儿清理）的后台单线程；避免在桥线程做目录扫描 / 删除阻塞 JS */
    private val maintenanceExecutor: ExecutorService = Executors.newSingleThreadExecutor()

    override fun getName(): String = NAME

    override fun setup(options: ReadableMap, promise: Promise) {
        DownloadEngine.init(reactContext)
        DownloadEngine.setListener(this)
        if (options.hasKey("progressIntervalMs")) {
            val raw = options.getDouble("progressIntervalMs")
            if (raw.isFinite()) DownloadEngine.setProgressIntervalMs(raw.toLong())
        }
        promise.resolve(null)
    }

    override fun invalidate() {
        // 仅清自身，避免热重载后覆盖新实例注册的 listener
        DownloadEngine.clearListener(this)
        maintenanceExecutor.shutdown()
        super.invalidate()
    }

    override fun start(request: ReadableMap, promise: Promise) {
        try {
            val taskId = request.getString("taskId")
            val contentKey = request.getString("contentKey")
            val url = request.getString("url")
            val destDir = request.getString("destDir")
            val stagingKey = request.getString("stagingKey")
            val finalName = request.getString("finalName")
            if (taskId.isNullOrEmpty() || contentKey.isNullOrEmpty() || url.isNullOrEmpty() ||
                destDir.isNullOrEmpty() || stagingKey.isNullOrEmpty() || finalName.isNullOrEmpty()
            ) {
                return promise.reject("invalidRequest", "missing required field")
            }
            if (!request.hasKey("attemptId")) return promise.reject("invalidRequest", "attemptId required")
            // getInt 实为 Double.toInt() 会静默截断 → 用 getDouble 严格校验有限、整数、非负、在 Int 范围
            val attemptIdRaw = request.getDouble("attemptId")
            if (!attemptIdRaw.isFinite() || attemptIdRaw < 0.0 ||
                attemptIdRaw > Int.MAX_VALUE.toDouble() || attemptIdRaw != kotlin.math.floor(attemptIdRaw)
            ) {
                return promise.reject("invalidRequest", "attemptId must be a non-negative integer")
            }
            val attemptId = attemptIdRaw.toInt()
            if (url.toHttpUrlOrNull() == null) return promise.reject("invalidRequest", "url must be a valid http(s) url")
            if (!File(destDir).isAbsolute) return promise.reject("invalidRequest", "destDir must be absolute")
            if (!isSafeName(taskId) || !isSafeName(stagingKey) || !isSafeName(finalName)) {
                return promise.reject("invalidRequest", "unsafe file name")
            }
            val headers = request.getMap("headers")?.let { readStringMap(it) } ?: emptyMap()
            val tags = parseTags(request.getMap("tags"))
            val conflictStrategy = parseConflictStrategy(request.getString("conflictStrategy"))

            val existingBytes = DownloadEngine.start(
                taskId, attemptId, contentKey, url, headers, destDir, stagingKey, finalName, tags, conflictStrategy,
            )
            promise.resolve(
                Arguments.createMap().apply {
                    putString("taskId", taskId)
                    putInt("attemptId", attemptId)
                    putDouble("existingBytes", existingBytes.toDouble())
                },
            )
        } catch (e: DownloadEngine.AlreadyActiveException) {
            promise.reject("invalidRequest", "task already active")
        } catch (e: DownloadEngine.CapacityException) {
            promise.reject("capacity", "too many active downloads")
        } catch (e: DownloadEngine.ForegroundStartException) {
            promise.reject("systemLimit", "cannot start foreground service in background")
        } catch (e: RuntimeException) {
            promise.reject("invalidRequest", e.message ?: "bad request")
        }
    }

    /** 将暂停请求委托给引擎；暂停完成由引擎状态与事件异步确认 */
    override fun pause(taskId: String, promise: Promise) {
        DownloadEngine.pause(taskId)
        promise.resolve(null)
    }

    override fun cancel(taskId: String, promise: Promise) {
        DownloadEngine.cancel(taskId)
        promise.resolve(null)
    }

    override fun getActiveTasks(promise: Promise) {
        val arr = Arguments.createArray()
        for (row in DownloadEngine.snapshotActive()) {
            arr.pushMap(Arguments.createMap().apply {
                putString("taskId", row.taskId)
                putInt("attemptId", row.attemptId)
                putString("state", row.state)
                putDouble("downloadedBytes", row.downloadedBytes.toDouble())
                putDouble("totalBytes", row.totalBytes.toDouble())
            })
        }
        promise.resolve(arr)
    }

    override fun getUnackedCompletions(promise: Promise) {
        val arr = Arguments.createArray()
        for (r in DownloadEngine.unackedReceipts()) {
            arr.pushMap(Arguments.createMap().apply {
                putString("taskId", r.taskId)
                putString("contentKey", r.contentKey)
                putString("path", r.path)
                putString("extension", r.extension)
                putDouble("sizeBytes", r.sizeBytes.toDouble())
                putBoolean("taggedOk", r.taggedOk)
            })
        }
        promise.resolve(arr)
    }

    override fun ackCompletion(taskId: String) {
        DownloadEngine.ackCompletion(taskId)
    }

    override fun setNotificationContext(context: ReadableMap) {
        // A4：处理聚合通知计数和本地化文案；native 不持有译文
    }

    override fun cleanupOrphans(downloadRoot: String, liveStagingKeys: ReadableArray, promise: Promise) {
        if (!File(downloadRoot).isAbsolute) {
            return promise.reject("invalidRequest", "downloadRoot must be absolute")
        }
        // 在桥线程读出 ReadableArray（跨线程访问不安全），再把目录扫描 / 删除丢后台单线程，避免阻塞 JS
        val keys = HashSet<String>(liveStagingKeys.size())
        for (i in 0 until liveStagingKeys.size()) {
            liveStagingKeys.getString(i)?.let { keys.add(it) }
        }
        maintenanceExecutor.execute {
            val unresolved = try {
                DownloadEngine.cleanupOrphans(downloadRoot, keys)
            } catch (_: Throwable) {
                // 整趟没跑成：按「一条都没清掉」回报，调用方自己决定要不要信这个目录
                1
            }
            promise.resolve(unresolved.toDouble())
        }
    }

    // —— 将 DownloadEngine.Listener 事件转发为 JS 事件 ——

    override fun onBegin(taskId: String, attemptId: Int, disposition: String, totalBytes: Long) {
        emitOnBegin(Arguments.createMap().apply {
            putString("taskId", taskId)
            putInt("attemptId", attemptId)
            putString("disposition", disposition)
            putDouble("totalBytes", totalBytes.toDouble())
        })
    }

    override fun onProgress(taskId: String, attemptId: Int, downloadedBytes: Long, totalBytes: Long) {
        emitOnProgress(Arguments.createMap().apply {
            putString("taskId", taskId)
            putInt("attemptId", attemptId)
            putDouble("downloadedBytes", downloadedBytes.toDouble())
            putDouble("totalBytes", totalBytes.toDouble())
        })
    }

    override fun onFinalizing(taskId: String, attemptId: Int) {
        emitOnFinalizing(Arguments.createMap().apply {
            putString("taskId", taskId)
            putInt("attemptId", attemptId)
        })
    }

    override fun onComplete(
        taskId: String, attemptId: Int, contentKey: String,
        path: String, extension: String, sizeBytes: Long, taggedOk: Boolean,
    ) {
        emitOnComplete(Arguments.createMap().apply {
            putString("taskId", taskId)
            putInt("attemptId", attemptId)
            putString("contentKey", contentKey)
            putString("path", path)
            putString("extension", extension)
            putDouble("sizeBytes", sizeBytes.toDouble())
            putBoolean("taggedOk", taggedOk)
        })
    }

    override fun onError(
        taskId: String, attemptId: Int, code: String, phase: String,
        httpStatus: Int, retryable: Boolean, partialRetained: Boolean, message: String,
    ) {
        emitOnError(Arguments.createMap().apply {
            putString("taskId", taskId)
            putInt("attemptId", attemptId)
            putString("code", code)
            putString("phase", phase)
            putInt("httpStatus", httpStatus)
            putBoolean("retryable", retryable)
            putBoolean("partialRetained", partialRetained)
            putString("message", message)
        })
    }

    override fun onCanceled(taskId: String, attemptId: Int) {
        emitOnCanceled(Arguments.createMap().apply {
            putString("taskId", taskId)
            putInt("attemptId", attemptId)
        })
    }

    override fun onPaused(taskId: String, attemptId: Int) {
        emitOnPaused(Arguments.createMap().apply {
            putString("taskId", taskId)
            putInt("attemptId", attemptId)
        })
    }

    private fun readStringMap(map: ReadableMap): Map<String, String> {
        val out = HashMap<String, String>()
        val it = map.keySetIterator()
        while (it.hasNextKey()) {
            val key = it.nextKey()
            // header 值必须是字符串；非字符串直接拒绝，不静默丢弃
            val value = map.getString(key) ?: throw IllegalArgumentException("header must be string")
            out[key] = value
        }
        return out
    }
    /** 解析 DownloadTags；fields 必填且每个值为字符串数组，coverUrl/coverHeaders 可选；无 tags 返回 null，非法输入映射为 invalidRequest */
    private fun parseTags(map: ReadableMap?): DownloadEngine.DownloadTags? {
        if (map == null) return null
        val fieldsMap = map.getMap("fields") ?: throw IllegalArgumentException("tags.fields required")
        val fields = HashMap<String, List<String>>()
        val keys = fieldsMap.keySetIterator()
        while (keys.hasNextKey()) {
            val key = keys.nextKey()
            val arr = fieldsMap.getArray(key) ?: throw IllegalArgumentException("field must be an array")
            fields[key] = (0 until arr.size()).map {
                arr.getString(it) ?: throw IllegalArgumentException("field value must be string")
            }
        }
        val coverHeaders = map.getMap("coverHeaders")?.let { readStringMap(it) } ?: emptyMap()
        return DownloadEngine.DownloadTags(fields, map.getString("coverUrl"), coverHeaders)
    }

    /** 解析冲突处理策略；缺省为 fail，支持 fail / overwrite / rename，非法值映射为 invalidRequest */
    private fun parseConflictStrategy(raw: String?): DownloadEngine.ConflictStrategy = when (raw) {
        null, "fail" -> DownloadEngine.ConflictStrategy.FAIL
        "overwrite" -> DownloadEngine.ConflictStrategy.OVERWRITE
        "rename" -> DownloadEngine.ConflictStrategy.RENAME
        else -> throw IllegalArgumentException("invalid conflictStrategy")
    }
    /** 拒绝包含路径分隔符、控制字符或路径特殊段的文件名 */
    private fun isSafeName(name: String): Boolean =
        name.isNotEmpty() &&
            name.none { it == '/' || it == '\\' || it.code < 0x20 } &&
            name != "." && name != ".."


    companion object {
        const val NAME = "NativeDownloadEngine"
    }
}
