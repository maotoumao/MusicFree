package `fun`.upup.musicfree.download

import android.content.Context
import android.media.MediaScannerConnection
import android.os.SystemClock
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import `fun`.upup.musicfree.audiotags.AudioTagStore
import `fun`.upup.musicfree.audiotags.CoverEdit
import `fun`.upup.musicfree.audiotags.TagStatus
import `fun`.upup.musicfree.audiotags.TagWritePatch
import java.io.EOFException
import java.io.File
import java.io.IOException
import java.io.InterruptedIOException
import java.io.RandomAccessFile
import java.net.ConnectException
import java.net.ProtocolException
import java.net.SocketException
import java.net.UnknownHostException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import javax.net.ssl.SSLException
import javax.net.ssl.SSLHandshakeException
import javax.net.ssl.SSLPeerUnverifiedException
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * 自研下载引擎（进程级单例）
 *
 * OkHttp 将响应流写入 `.part`，已有分片则按 Range 续传，完成后按冲突策略发布：fail 遇到占用即报 targetExists，overwrite 原子替换，rename 自增后缀避让
 * 并发由 JS 控制，原生以固定线程池和有界容量作为安全兜底
 *
 * 每个任务登记持有一个原子 [Phase]：正常流程为 `Active → Finalizing → Done`；暂停流程为 `Active → Pausing →（worker 退出后）Paused`，恢复为 `Paused → Active`
 * `Pausing` 表示已请求暂停但 worker 尚未退出；`Paused` 表示 worker 已退出且任务静止，只有进入 `Paused` 后才允许 resume，避免新旧 worker 并发写同一 `.part`
 * `Outcome` 是终态 payload，与状态一次 CAS 写入 `Done(outcome)`，无「结束但结果未定」空窗
 * 文件清理、注销、容量归还与唯一终态事件都在 [finishTerminal]（由 `terminated` 守卫保证只执行一次），emit 在清理之后，确保 JS 收到终态时 taskId 与路径已释放
 * 资源分层：容量 permit、`reservedPaths` 与 active 登记随任务存活，仅在终态释放；前台服务名额由 worker 的 `releaseFgs` 单独管理，worker 运行时占用，暂停释放、恢复重获
 * 事件经 Listener 回传 module，再转为 emitOnXxx；emit 异常与传输终态严格隔离
 *
 * 已实现：传输、Range 续传（含起点与完整性校验）、暂停 / 恢复、节流进度、容器嗅探、按冲突策略发布（fail 报 targetExists、overwrite 原子替换、rename 自增后缀避让）、内嵌 tag（复用 audiotags 的 TagLib 写入引擎）、取消、前台服务保活和有界容量
 * `.part.meta` / If-Range / 活动任务跨进程重连 → A4 后续
 */
object DownloadEngine {

    /** 引擎回传给 module 的事件；module 负责转成 emitOnXxx */
    interface Listener {
        fun onBegin(taskId: String, attemptId: Int, disposition: String, totalBytes: Long)
        fun onProgress(taskId: String, attemptId: Int, downloadedBytes: Long, totalBytes: Long)
        fun onFinalizing(taskId: String, attemptId: Int)
        fun onComplete(
            taskId: String, attemptId: Int, contentKey: String,
            path: String, extension: String, sizeBytes: Long, taggedOk: Boolean,
        )
        fun onError(
            taskId: String, attemptId: Int, code: String, phase: String,
            httpStatus: Int, retryable: Boolean, partialRetained: Boolean, message: String,
        )
        fun onCanceled(taskId: String, attemptId: Int)
        /** 原生自主暂停（前台服务超时）；JS 主动 pause 不经此回调 */
        fun onPaused(taskId: String, attemptId: Int)
    }

    /** start 超出原生硬容量时抛出，由 module 映射为 `capacity` reject */
    class CapacityException : RuntimeException()

    /** 同 taskId、同 `.part` 路径或同最终文件名已在下载中，由 module 映射为 `invalidRequest` reject */
    class AlreadyActiveException : RuntimeException()

    /** 前台服务启动被系统限制时抛出，由 module 映射为 `systemLimit` reject */
    class ForegroundStartException(cause: Throwable) : RuntimeException(cause)

    /** 下载完成后写入的 tag；fields 原样包含标准字段和自定义 key MF_MUSICITEM（JS 已脱敏），封面按 URL 拉取 */
    class DownloadTags(
        val fields: Map<String, List<String>>,
        val coverUrl: String?,
        val coverHeaders: Map<String, String>,
    )

    /** 最终文件名已被磁盘文件占用时的处置：fail 报 targetExists，overwrite 原子替换，rename 自增后缀避让 */
    enum class ConflictStrategy { FAIL, OVERWRITE, RENAME }

    /** attempt 的单个原子相位；`Done` 原子携带终态 payload，杜绝状态与结果分离的空窗 */
    private sealed interface Phase {
        object Active : Phase
        /** 已请求暂停，但 worker 尚未退出；此时禁止 resume */
        object Pausing : Phase
        /** worker 已退出且任务静止；仅此相位允许 resume */
        object Paused : Phase
        object Finalizing : Phase
        data class Done(val outcome: Outcome) : Phase
    }

    /** 终态 payload：与状态通过一次 CAS 一并写入 `Done(outcome)`，收尾后发出对应事件 */
    private sealed interface Outcome {
        data class Completed(val path: String, val ext: String, val size: Long, val taggedOk: Boolean) : Outcome
        data class Failed(
            val code: String, val phase: String, val httpStatus: Int,
            val retryable: Boolean, val partialRetained: Boolean, val message: String,
        ) : Outcome
        object Canceled : Outcome
    }

    /** 错误分类结果：错误码与是否可重试，按操作边界判定，不由调用方从 code 推测 */
    private data class ErrorClass(val code: String, val retryable: Boolean)

    /** Content-Range 解析结果（total 为 `*` 时未知） */
    private data class ContentRange(val start: Long, val end: Long, val total: Long?)

    private enum class MoveResult { SUCCESS, TARGET_EXISTS }

    /** 传输并发硬上限（安全网；业务并发由 JS 控制，只 start ≤ basic.maxDownload） */
    private const val MAX_CONCURRENT = 6

    /** 原生同时跟踪的 attempt 硬容量；超出以 capacity 拒绝，防止 JS 失控堆积 */
    private const val MAX_ACTIVE = 64

    private const val BUFFER_SIZE = 64 * 1024

    /** 封面响应的读取上限为 2 MiB；超限、空响应或读取失败时跳过封面，音频文件仍可完成发布 */
    private const val COVER_MAX_BYTES = 2L * 1024 * 1024

    /** rename 候选后缀的最大序号（基名加 (1)…(MAX_RENAME_SUFFIX)）；全部占用时以 targetExists 失败，避免无限探测 */
    private const val MAX_RENAME_SUFFIX = 9999

    /** `.part` 临时文件后缀；start 构造与 cleanupOrphans 反解 stagingKey 共用，防止两处漂移 */
    private const val PART_SUFFIX = ".part"

    /** 本应用 `.part` 的文件名形态：stagingKey = SHA256 hex（64 位小写）+ 后缀 */
    private val OUR_PART_NAME = Regex("^[0-9a-f]{64}\\.part$")

    /** 调用方不得覆盖的引擎自有 header；剥离 Range 与 Accept-Encoding，避免写入偏移错误 */
    private val ENGINE_OWNED_HEADERS = setOf("range", "accept-encoding")

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()
    private val pool = Executors.newFixedThreadPool(MAX_CONCURRENT)
    private val active = ConcurrentHashMap<String, DownloadTask>()

    /** 已占用路径 key（`.part` 物理路径或不含扩展名的最终名）→ 持有该占用的 attempt；按 attempt 引用删除，避免同 taskId 的 ABA 误删 */
    private val reservedPaths = ConcurrentHashMap<String, DownloadTask>()

    /** 有界容量许可；副作用前 tryAcquire，收尾时 release 一次 */
    private val capacity = Semaphore(MAX_ACTIVE)

    /** 前台服务保活：liveWorkers 计数与 start/stop 都在 fgsLock 下，杜绝交错 */
    private val fgsLock = Any()
    private var liveWorkers = 0
    /** 已发出启动命令且未发出停止命令；与 liveWorkers 分离，因为服务超时会在 worker 尚未退出时就停止服务，此后新 worker 必须重启服务而非搭便车 */
    private var serviceRunning = false

    @Volatile private var appContext: Context? = null
    @Volatile private var receiptStore: ReceiptStore? = null
    @Volatile private var progressIntervalMs = 1000L
    private val listenerRef = AtomicReference<Listener?>(null)

    /** 下载任务的运行态；跨多次 attempt 代次存活（每次 resume 更新 attemptId / url / headers） */
    private class DownloadTask(
        val taskId: String,
        /** 当前 worker 代次；resume 时严格递增，并与事件一起读取 */
        @Volatile var attemptId: Int,
        val contentKey: String,
        /** resume 更新的请求地址；worker 读取时必须可见 */
        @Volatile var url: String,
        /** resume 更新的请求 headers；worker 读取时必须可见 */
        @Volatile var headers: Map<String, String>,
        val destDir: String,
        val stagingKey: String,
        val finalName: String,
        val partFile: File,
        val partKey: String,
        val nameKey: String,
        val tags: DownloadTags?,
        val conflictStrategy: ConflictStrategy,
    ) {
        val phase = AtomicReference<Phase>(Phase.Active)
        /** 终态收尾守卫：cancel-paused 与 worker finally 可能同时收尾，CAS 赢家唯一执行 */
        val terminated = AtomicBoolean(false)
        @Volatile var call: Call? = null
        @Volatile var downloaded = 0L
        @Volatile var total = -1L
        @Volatile var lastEmitMs = 0L
        /** rename 发布时实际占用的最终路径 key，供收尾释放；其余策略沿用 start 预占的 nameKey */
        @Volatile var committedNameKey: String? = null
    }

    /** getActiveTasks 的快照行（替代位置数组，字段随契约变更有编译期保护） */
    data class ActiveSnapshot(
        val taskId: String,
        val attemptId: Int,
        val state: String,
        val downloadedBytes: Long,
        val totalBytes: Long,
    )

    fun init(context: Context) {
        val app = context.applicationContext
        if (appContext == null) appContext = app
        if (receiptStore == null) receiptStore = ReceiptStore(app)
        MusicFreeDownloadService.ensureChannel(app)
    }

    fun setListener(listener: Listener) {
        listenerRef.set(listener)
    }

    /** 仅当当前 listener 仍是该实例时清除（热重载后新 listener 不被旧 module 误清） */
    fun clearListener(listener: Listener) {
        listenerRef.compareAndSet(listener, null)
    }

    fun setProgressIntervalMs(ms: Long) {
        if (ms in 250..10_000) progressIntervalMs = ms
    }

    /** 当前活动尝试快照 */
    fun snapshotActive(): List<ActiveSnapshot> = active.values.mapNotNull { a ->
        val label = when (a.phase.get()) {
            Phase.Active -> "downloading"
            // pausing 与 paused 必须分开：前者 worker 还在跑（仍占传输名额、仍会发事件），
            // 后者才是静止可续的。两者合并上报会让 JS 把还在跑的任务当成已停，丢掉它后续的事件
            Phase.Pausing -> "pausing"
            Phase.Paused -> "paused"
            Phase.Finalizing -> "finalizing"
            else -> return@mapNotNull null
        }
        ActiveSnapshot(a.taskId, a.attemptId, label, a.downloaded, a.total)
    }

    /** 未入账的完成回执（App 重连时 JS 重放入账） */
    fun unackedReceipts(): List<ReceiptStore.Receipt> = receiptStore?.list().orEmpty()

    /** JS 入账后清除对应回执 */
    fun ackCompletion(taskId: String) {
        receiptStore?.remove(taskId)
    }

    /**
     * 清理 downloadRoot 下的孤儿 `.part`：文件名形态是我们自己的、去 PART_SUFFIX 得到的
     * stagingKey 又不在存活集合中，才删
     * 完成回执存在 app 私有 filesDir（见 ReceiptStore）、有 ackCompletion 独立生命周期，
     * 本来就不在这个目录下，不会被误删
     *
     * **只删名字形态是我们自己的那些**：落盘目录可以是用户自选的公共目录，那里的
     * `xxx.part` 完全可能是别的应用的未完成文件——「不在存活集合里」不等于「可以删」。
     * 我们的 stagingKey 是 SHA256 hex（见 core/download 的 identity.stagingKeyOf），
     * 故按 64 位小写 hex 卡形态；这条与 JS 侧的身份算法绑定，改一处要改两处
     *
     * **不**顺带清写 tag 的暂存副本（`.<最终名>.tag.<nanos>.tmp`，见 audiotags 的
     * AudioTagStore）：进程在写 tag 期间被杀确实会把一份与最终文件等大的副本留在用户
     * 目录里，但那个名字形态里没有任何本应用专属标识（用户自己的 `.x.tag.1.tmp` 同样命中），
     * 「够旧」也只能证明旧、证明不了归属。删不属于自己的文件比留下垃圾糟得多，
     * 故这里不碰它——真要治，得让 AudioTagStore 的暂存名带上专属前缀（另开一轮）
     */
    fun cleanupOrphans(downloadRoot: String, liveStagingKeys: Set<String>): Int {
        // 目录列不出来（不存在 / 无权限）：报 1 条「没清掉」，调用方据此判断能不能信这个目录
        val files = File(downloadRoot).listFiles() ?: return 1
        var unresolved = 0
        for (file in files) {
            // 先按文件名过滤（廉价），只对 .part 候选做 isFile 的 stat；下载目录多为已完成音频，避免逐个 stat
            if (!OUR_PART_NAME.matches(file.name) || !file.isFile) continue
            val stagingKey = file.name.removeSuffix(PART_SUFFIX)
            // 保护判定放在**要删的那一刻**现查，而不是循环前拍一次快照：枚举与删除之间
            // 完全可能有新任务登记并接管这个 `.part`（start 走桥调用、清理走维护线程，
            // 两者没有共用互斥），拿旧快照就会把当前会话正在续传的断点删掉
            // native 自己的 active 是强制保护，纵深防御 JS 集合过期 / 传错
            if (!isPartProtected(file, stagingKey, liveStagingKeys)) {
                val removed = try {
                    file.delete()
                } catch (_: Throwable) {
                    false
                }
                // 删不掉要如实回报：换目录时这一趟清理承担正确性（残留 `.part` 会被
                // 无条件续传接管），调用方得知道「没清干净」而不是以为清了
                if (!removed) unresolved++
            }
        }
        return unresolved
    }

    /**
     * 启动 / 续传：返回磁盘已有 `.part` 字节数（受理确认里回给 JS）。
     * 同 taskId / 路径 / 文件名已在下载抛 [AlreadyActiveException]；超容量抛 [CapacityException]；
     * 前台服务启动受限抛 [ForegroundStartException]。
     */
    fun start(
        taskId: String, attemptId: Int, contentKey: String, url: String,
        headers: Map<String, String>, destDir: String, stagingKey: String, finalName: String,
        tags: DownloadTags?, conflictStrategy: ConflictStrategy,
    ): Long {
        val ctx = appContext ?: throw IllegalStateException("download engine not initialized")

        // 同 taskId 已存在：暂停中则恢复（复用已占容量 / 登记 / `.part`），否则拒绝重复启动
        active[taskId]?.let {
            return resume(it, ctx, attemptId, contentKey, url, headers, destDir, stagingKey, finalName)
        }

        if (!capacity.tryAcquire()) throw CapacityException()

        val partFile = File(destDir, "$stagingKey$PART_SUFFIX")
        val partKey = partFile.path
        val nameKey = File(destDir, finalName).path
        val attempt = DownloadTask(
            taskId, attemptId, contentKey, url, sanitizeHeaders(headers),
            destDir, stagingKey, finalName, partFile, partKey, nameKey, tags, conflictStrategy,
        )
        // 原子登记 taskId、`.part` 路径与最终文件名；任一冲突即整体回滚并拒绝（A1 不顶替、不共享文件）
        if (active.putIfAbsent(taskId, attempt) != null) {
            capacity.release()
            throw AlreadyActiveException()
        }
        if (reservedPaths.putIfAbsent(partKey, attempt) != null) {
            active.remove(taskId, attempt)
            capacity.release()
            throw AlreadyActiveException()
        }
        // rename 使用不含扩展名的逻辑 key 在发布时动态占名，与固定策略共用命名空间，故不提前占用 nameKey
        if (conflictStrategy != ConflictStrategy.RENAME &&
            reservedPaths.putIfAbsent(nameKey, attempt) != null
        ) {
            reservedPaths.remove(partKey, attempt)
            active.remove(taskId, attempt)
            capacity.release()
            throw AlreadyActiveException()
        }

        // 前台服务保活；启动失败回滚本次尝试
        try {
            acquireFgs(ctx)
        } catch (e: ForegroundStartException) {
            reservedPaths.remove(nameKey, attempt)
            reservedPaths.remove(partKey, attempt)
            active.remove(taskId, attempt)
            capacity.release()
            throw e
        }

        val existing = if (partFile.exists()) partFile.length() else 0L
        pool.execute { runTask(attempt) }
        return existing
    }

    /**
     * 暂停：CAS `Active→Pausing` 并取消请求；worker 退出传输、释放前台服务名额后再转为 `Paused`
     * `Paused` 保证无在跑 worker，避免新旧 worker 并发写同一 `.part`；非 `Active` 相位忽略
     */
    fun pause(taskId: String) {
        val attempt = active[taskId] ?: return
        if (attempt.phase.compareAndSet(Phase.Active, Phase.Pausing)) {
            attempt.call?.cancel()
        }
    }

    /**
     * 前台服务超时兜底：把所有正在传输的任务暂停（CAS Active→Pausing、保 .part、留任务登记），worker 退出后转 Paused 可续传
     * worker 退出时统一 emit onPaused（与用户主动暂停同一条路径）；已在暂停 / 静止 / 定稿的任务不动
     * [stopService] 在前台服务锁内执行，与「服务已被系统收回」的标记原子完成，避免与新任务的启动命令交错
     */
    fun onServiceTimeout(stopService: () -> Unit) {
        synchronized(fgsLock) {
            serviceRunning = false // 系统已收回前台，后续 acquireFgs 必须重启服务
            stopService()
        }
        for (attempt in active.values) {
            if (attempt.phase.compareAndSet(Phase.Active, Phase.Pausing)) {
                attempt.call?.cancel()
            }
        }
    }

    /** 取消：`Active` / `Pausing` 由 worker finally 收尾；`Paused` 无 worker，由本方法收尾；`Finalizing` / `Done` 忽略 */
    fun cancel(taskId: String) {
        val attempt = active[taskId] ?: return
        while (true) {
            when (val cur = attempt.phase.get()) {
                Phase.Active, Phase.Pausing ->
                    if (attempt.phase.compareAndSet(cur, Phase.Done(Outcome.Canceled))) {
                        attempt.call?.cancel() // worker 感知退出后由 finally 收尾
                        return
                    }
                Phase.Paused ->
                    if (attempt.phase.compareAndSet(Phase.Paused, Phase.Done(Outcome.Canceled))) {
                        finishTerminal(attempt) // 无 worker，且前台服务名额已释放
                        return
                    }
                else -> return // Finalizing / Done
            }
            // CAS 失败表示相位已变化，必须重读后重试
        }
    }

    /**
     * 恢复：只接受静止的 `Paused`（worker 已退出），校验身份与代次后 CAS `Paused→Active` 并重启 worker 续传
     * 身份必须匹配 `contentKey`、目录、staging 与 `finalName`，`attemptId` 必须严格递增；非 `Paused`（包括 `Pausing`）或校验失败时抛出 [AlreadyActiveException]
     */
    private fun resume(
        attempt: DownloadTask, ctx: Context, attemptId: Int, contentKey: String,
        url: String, headers: Map<String, String>, destDir: String, stagingKey: String, finalName: String,
    ): Long {
        // 校验 contentKey、目录、staging、finalName 与原任务一致，且 attemptId 严格递增，防止误复用 taskId 将新 URL 追加到旧 `.part`
        if (contentKey != attempt.contentKey || destDir != attempt.destDir ||
            stagingKey != attempt.stagingKey || finalName != attempt.finalName ||
            attemptId <= attempt.attemptId
        ) {
            throw AlreadyActiveException()
        }
        if (!attempt.phase.compareAndSet(Phase.Paused, Phase.Active)) {
            throw AlreadyActiveException()
        }
        attempt.attemptId = attemptId
        attempt.url = url
        attempt.headers = sanitizeHeaders(headers)
        attempt.call = null
        val existing = if (attempt.partFile.exists()) attempt.partFile.length() else 0L // 在提交 worker 前固定读取
        try {
            acquireFgs(ctx)
        } catch (e: ForegroundStartException) {
            // 回滚：每次 CAS 失败都必须重读；读到 Done 必须执行 finishTerminal，Pausing 必须转为 Paused，避免并发 cancel 时无人收尾
            while (true) {
                when (attempt.phase.get()) {
                    Phase.Active -> if (attempt.phase.compareAndSet(Phase.Active, Phase.Paused)) break
                    is Phase.Done -> {
                        finishTerminal(attempt)
                        break
                    }
                    Phase.Pausing -> if (attempt.phase.compareAndSet(Phase.Pausing, Phase.Paused)) break
                    else -> break // Paused / Finalizing 不应出现在此处
                }
            }
            throw e
        }
        pool.execute { runTask(attempt) }
        return existing
    }

    /** 前台服务名额 +1；首个 worker 启动服务，启动受限时抛出 [ForegroundStartException] */
    private fun acquireFgs(ctx: Context) {
        synchronized(fgsLock) {
            if (!serviceRunning) {
                try {
                    MusicFreeDownloadService.start(ctx)
                } catch (e: Exception) {
                    throw ForegroundStartException(e)
                }
                serviceRunning = true
            }
            liveWorkers++
        }
    }

    /** 前台服务名额 -1；最后一个 worker 退出后请求服务停止（服务自行收尾） */
    private fun releaseFgs() {
        synchronized(fgsLock) {
            if (--liveWorkers == 0 && serviceRunning) {
                appContext?.let { MusicFreeDownloadService.stop(it) }
                serviceRunning = false
            }
        }
    }

    private fun runTask(attempt: DownloadTask) {
        val partFile = attempt.partFile
        try {
            if (attempt.phase.get() !== Phase.Active) return // 入队后、启动前已被取消

            File(attempt.destDir).mkdirs()
            val startOffset = if (partFile.exists()) partFile.length() else 0L
            attempt.downloaded = startOffset

            val builder = Request.Builder().url(attempt.url)
            attempt.headers.forEach { (k, v) -> builder.header(k, v) }
            builder.header("Accept-Encoding", "identity") // 防压缩导致传输字节与 offset 不一致
            if (startOffset > 0) builder.header("Range", "bytes=$startOffset-")

            val call = client.newCall(builder.build())
            attempt.call = call
            if (attempt.phase.get() !== Phase.Active) {
                call.cancel()
                return
            }

            call.execute().use { response ->
                if (attempt.phase.get() !== Phase.Active) return
                // 暂停恰好撞上传输完成时，resume 的尾部 Range 可能收到 416；仅当声明的完整长度等于本地 `.part` 长度时发布
                if (response.code == 416) {
                    val fullLen = parseUnsatisfiedRangeTotal(response.header("Content-Range"))
                    if (fullLen != null && startOffset > 0 && fullLen == startOffset && partFile.length() == startOffset) {
                        attempt.total = startOffset
                        if (attempt.phase.compareAndSet(Phase.Active, Phase.Finalizing)) {
                            emitSafely { it.onFinalizing(attempt.taskId, attempt.attemptId) }
                            publish(attempt, response.header("Content-Type"))
                        }
                    } else {
                        failTransfer(attempt, "http", "connect", 416, false, "range not satisfiable")
                    }
                    return
                }
                if (!response.isSuccessful) {
                    failTransfer(attempt, "http", "connect", response.code, isRetryableHttp(response.code), "HTTP ${response.code}")
                    return
                }
                val body = response.body ?: run {
                    failTransfer(attempt, "network", "transfer", 0, true, "empty body")
                    return
                }
                val contentLen = body.contentLength()
                if (response.code == 206) {
                    // 续传：必须有合法 Content-Range 且起点等于本地长度，否则拒绝（防错位追加）
                    val range = parseContentRange(response.header("Content-Range"))
                    if (range == null || range.start != startOffset) {
                        failTransfer(attempt, "http", "connect", 206, false, "range mismatch")
                        return
                    }
                    attempt.total = range.total ?: if (contentLen >= 0) startOffset + contentLen else -1L
                } else {
                    attempt.total = if (contentLen >= 0) contentLen else -1L
                }
                val resumed = response.code == 206
                val disposition = when {
                    resumed -> "resumed"
                    startOffset > 0 -> "restarted" // 请求了 Range 但服务端返 200 → 从头重下
                    else -> "fresh"
                }
                emitSafely { it.onBegin(attempt.taskId, attempt.attemptId, disposition, attempt.total) }

                RandomAccessFile(partFile, "rw").use { raf ->
                    if (resumed) {
                        raf.seek(startOffset)
                    } else {
                        raf.setLength(0)
                        attempt.downloaded = 0
                    }
                    val input = body.byteStream()
                    val buf = ByteArray(BUFFER_SIZE)
                    while (true) {
                        if (attempt.phase.get() !== Phase.Active) return // 取消 → finally 收尾
                        val n = input.read(buf)
                        if (n < 0) break
                        raf.write(buf, 0, n)
                        attempt.downloaded += n
                        maybeEmitProgress(attempt)
                    }
                    raf.fd.sync()
                }

                // 完整性校验：0 字节视为失败；已知 total 必须下满，否则不发布残缺文件
                if (attempt.downloaded == 0L) {
                    failTransfer(attempt, "network", "transfer", 0, true, "empty response")
                    return
                }
                if (attempt.total >= 0 && attempt.downloaded != attempt.total) {
                    failTransfer(attempt, "network", "transfer", 0, true, "incomplete")
                    return
                }

                // 传输完成 → 进入 FINALIZING（发布前非终态）；抢不到说明已被取消
                if (!attempt.phase.compareAndSet(Phase.Active, Phase.Finalizing)) return
                emitSafely { it.onFinalizing(attempt.taskId, attempt.attemptId) }
                publish(attempt, response.header("Content-Type"))
            }
        } catch (e: Throwable) {
            failException(attempt, e)
        } finally {
            // 先在仍持 FGS 名额时收口终态（含 finishTerminal 写回执/清理），再释放前台服务，
            // 避免最后一个 worker 在「文件已发布、回执未落盘」期间失去前台保护被杀。
            try {
                // 交接：每次 CAS 失败都必须重读；读到 Done 必须执行 finishTerminal，避免 cancel 抢先收尾时无人清理
                while (true) {
                    when (attempt.phase.get()) {
                        is Phase.Done -> {
                            finishTerminal(attempt)
                            break
                        }
                        // worker 已退出后才转为 Paused，保证 resume 时没有并发运行的旧 worker
                        Phase.Pausing -> if (attempt.phase.compareAndSet(Phase.Pausing, Phase.Paused)) {
                            // worker 已退、任务静止，此刻才代表可续。不论暂停是系统超时还是用户发起都要通知：
                            // pause() 的 Promise 在 Active→Pausing 就 resolve 了，JS 只能靠本事件得知何时能安全续传
                            emitSafely { it.onPaused(attempt.taskId, attempt.attemptId) }
                            break
                        }
                        else -> break // Active / Paused / Finalizing 不应出现在此处
                    }
                }
            } finally {
                releaseFgs() // worker 退出总是释放前台服务名额
            }
        }
    }

    /**
     * 这个 `.part` 是否还有人认领（JS 传来的存活集合 ∪ 原生自己在跟踪的任务）
     *
     * 原生这一侧比的是**文件本身**而不只是 stagingKey：用户可以在队列不空时改下载目录，
     * 已开始的任务留在原目录跑完，故同一刻可能有两个目录都活着。stagingKey 只由
     * 「歌 + 音质」决定，两个目录里会出现同名 `.part`——只比名字的话，A 目录里活着的任务
     * 会替 B 目录里那份陈旧残留挡下清理，而那份残留正是「按已有长度无条件续传」会接管、
     * 从而发布出损坏文件的东西
     */
    private fun isPartProtected(partFile: File, stagingKey: String, liveStagingKeys: Set<String>): Boolean =
        stagingKey in liveStagingKeys ||
            active.values.any { it.stagingKey == stagingKey && isSameFile(it.partFile, partFile) }

    /**
     * 两个路径是不是同一份文件
     *
     * 先比抽象路径（绝大多数情况就是逐字符相等），不等再比 canonical——`/sdcard/Music` 与
     * `/storage/emulated/0/Music` 是同一个目录的两种拼法，`File.equals` 只比路径串会判成不等。
     * 这里是**保护**判定，判错的两个方向不对称：漏保护 = 删掉用户正在续传的断点，
     * 误保护 = 留下一份垃圾。故 canonical 取不到（IO 失败 / 权限）时保守认定为「是」
     */
    private fun isSameFile(a: File, b: File): Boolean {
        if (a == b) return true
        return try {
            a.canonicalPath == b.canonicalPath
        } catch (_: Throwable) {
            true
        }
    }

    /**
     * 请系统媒体库收录刚发布的文件；尽力而为，失败只影响「别的应用看不看得见」
     * 用 MediaScannerConnection 而非直接插 MediaStore：文件已经在盘上，要的只是让系统认领它
     */
    private fun notifyMediaScanner(file: File) {
        val ctx = appContext ?: return
        try {
            MediaScannerConnection.scanFile(ctx, arrayOf(file.absolutePath), null, null)
        } catch (_: Throwable) {
            // 扫描服务不可用（ROM 裁剪 / 正在重启）：不影响下载本身，下次系统自扫会收
        }
    }

    /** 发布：按冲突策略将 `.part` 提交为最终文件；只通过 CAS 记录 Outcome，onComplete 由收尾统一发出 */
    private fun publish(attempt: DownloadTask, contentType: String?) {
        // 先按 magic bytes 嗅探真实容器，顺带把明确不是音频的响应拦下
        val ext = when (val sniffed = ContainerSniffer.sniff(attempt.partFile)) {
            is ContainerSniffer.Sniff.Audio -> sniffed.ext
            // 服务端拿 200 回了一段文本（错误页 / 风控提示 / JSON）：状态码与字节数都「正常」，
            // 只有内容能戳穿它。发布出去就是一首点开即跳过的假歌，故就地判失败并清掉 `.part`
            ContainerSniffer.Sniff.NotAudio -> {
                val removed = deleteQuietly(attempt.partFile)
                failPublish(attempt, "notAudio", "finalize", "server returned non-audio content", !removed)
                return
            }
            // 认不出：可能是嗅探器没覆盖的冷门容器，按既有回退链猜扩展名，不误杀
            ContainerSniffer.Sniff.Unknown -> deriveExtension(contentType, attempt.url)
        }
        try {
            // 按冲突策略提交发布，得到最终落定文件；失败已在内部记录 Outcome
            val finalFile = commit(attempt, ext) ?: return
            // 先发布音频，再就地写入 tag，最后由 onComplete 回传；写入失败非致命，已发布的音频仍完整可用
            val taggedOk = embedTags(attempt, finalFile)
            // 通知系统媒体库：落盘目录可以是用户自选的公共目录，不扫一下别的播放器与
            // 文件管理器看不见这首歌（app 私有目录下系统会自行忽略，调了也无副作用）
            // 放在写 tag 之后：扫描要读到的是带标签的最终文件
            notifyMediaScanner(finalFile)
            attempt.phase.compareAndSet(
                Phase.Finalizing,
                Phase.Done(Outcome.Completed(finalFile.absolutePath, ext, finalFile.length(), taggedOk)),
            )
        } catch (e: Throwable) {
            val cls = classifyError(e)
            failPublish(attempt, cls.code, "publish", safeMessage(e), attempt.partFile.length() > 0)
        }
    }

    /**
    * 按冲突策略把 `.part` 提交为最终文件；成功返回落定文件，失败已记录 Outcome 并返回 null
    * fail：no-replace，目标被占用即报 targetExists；overwrite：通过 Os.rename 原子替换旧文件；rename：从基名起自增后缀避让
     */
    private fun commit(attempt: DownloadTask, ext: String): File? {
        val target = File(attempt.destDir, "${attempt.finalName}.$ext")
        return when (attempt.conflictStrategy) {
            // 固定策略的最终名已在 start 预占 nameKey，直接落盘
            ConflictStrategy.FAIL -> when (moveNoReplace(attempt.partFile, target)) {
                MoveResult.SUCCESS -> target
                // 目标被磁盘文件占用：保留旧文件，删除无法发布的 `.part`；删不掉则如实上报 partialRetained
                MoveResult.TARGET_EXISTS -> {
                    val removed = deleteQuietly(attempt.partFile)
                    failPublish(attempt, "targetExists", "publish", "target exists", !removed)
                    null
                }
            }
            ConflictStrategy.OVERWRITE -> {
                replaceExisting(attempt.partFile, target) // POSIX rename 原子替换；失败抛异常交由 publish 归类
                target
            }
            ConflictStrategy.RENAME -> resolveByRename(attempt, ext)
        }
    }

    /**
    * rename 策略：以不含扩展名的逻辑 key 从基名起自增后缀，逐个候选先在 reservedPaths 占名，再 no-replace 落盘
    * 该 key 与 fail/overwrite 的 nameKey 共用命名空间，因此同基名任务会彼此避让，也不会落到固定策略已占用的路径；后缀耗尽即失败
    * 落定的路径 key 记入 committedNameKey，由收尾释放
     */
    private fun resolveByRename(attempt: DownloadTask, ext: String): File? {
        for (index in 0..MAX_RENAME_SUFFIX) {
            val baseName = if (index == 0) attempt.finalName else "${attempt.finalName} ($index)"
            val key = File(attempt.destDir, baseName).path       // 不含扩展名的逻辑 key，与 fail/overwrite 的 nameKey 共用命名空间
            val candidate = File(attempt.destDir, "$baseName.$ext") // 含扩展名的实际落盘路径
            // 占不到说明该逻辑名已被活动任务占用，继续尝试下一个候选
            if (reservedPaths.putIfAbsent(key, attempt) != null) continue
            val result = try {
                moveNoReplace(attempt.partFile, candidate)
            } catch (e: Throwable) {
                reservedPaths.remove(key, attempt) // 落盘异常，先释放逻辑名占用，再上抛给 publish
                throw e
            }
            when (result) {
                MoveResult.SUCCESS -> {
                    attempt.committedNameKey = key
                    return candidate
                }
                MoveResult.TARGET_EXISTS -> reservedPaths.remove(key, attempt) // 磁盘已有目标，释放逻辑名占用后继续尝试
            }
        }
        // 基名及 (1)…(MAX_RENAME_SUFFIX) 均无法使用：删除无法发布的 `.part`；删不掉则如实上报 partialRetained
        val removed = deleteQuietly(attempt.partFile)
        failPublish(attempt, "targetExists", "publish", "rename suffix exhausted", !removed)
        return null
    }

    /**
     * no-replace 移动：先用 `O_CREAT|O_EXCL` **原子占名**，再把 `.part` rename 到这个占位上
     *
     * 不能用「先 exists() 再 rename」（`Files.move` 不带 REPLACE_EXISTING 也是先 stat 再 rename）：
     * 那两步之间的空窗里，别的应用完全可能刚好创建同名文件，rename 会把它静默覆盖掉。
     * 落盘目录默认是本应用私有目录时这只是理论问题，但用户可以把它改成公共目录
     * （见 core/download 的下载目录设置），那里的同名文件的确可能不是我们的
     *
     * 占位是我们自己刚创建的零字节文件，rename 覆盖的正常就是它；`Os.rename` 是单次
     * POSIX rename，没有「先删后建」的空窗。同进程并发另由 reservedPaths 占名串行化
     *
     * 残余风险（无法用现有 API 消掉，与既有的「完整原子 no-replace 留 A4」同一条欠账）：
     * - 别的应用若在这微秒级窗口里**删掉我们的占位再建自己的同名文件**，rename 仍会覆盖它。
     *   独立创建同名文件的常见竞争已被 O_EXCL 挡住；要连这种也挡住得靠 renameat2(RENAME_NOREPLACE)
     * - 占名成功后进程被杀（或 rename 失败且占位删不掉），最终名上会留下一个零字节文件。
     *   它不匹配 `.part` 清理规则，故不会被自动回收。本 app 的 JS 侧恒用 RENAME 策略，
     *   遇到它只会自增一次后缀，代价就是一个 0 字节死文件；不值得为它引入
     *   「按大小删用户目录里的文件」这种清理规则
     * - 路径别名（symlink 等）仍不防
     */
    private fun moveNoReplace(src: File, dst: File): MoveResult {
        val fd = try {
            Os.open(
                dst.path,
                OsConstants.O_WRONLY or OsConstants.O_CREAT or OsConstants.O_EXCL,
                OsConstants.S_IRUSR or OsConstants.S_IWUSR or
                    OsConstants.S_IRGRP or OsConstants.S_IROTH,
            )
        } catch (e: ErrnoException) {
            // 目标已存在：交调用方按冲突策略处置（保留旧文件 / 自增后缀避让）
            if (e.errno == OsConstants.EEXIST) return MoveResult.TARGET_EXISTS
            throw IOException("reserve target failed", e)
        }
        try {
            Os.close(fd)
        } catch (_: ErrnoException) {
            // 关不掉不影响占名事实：文件已经建出来了
        }
        return try {
            Os.rename(src.path, dst.path)
            MoveResult.SUCCESS
        } catch (e: ErrnoException) {
            // 占位删掉，别把一个零字节文件留在用户目录里冒充歌曲
            deleteQuietly(dst)
            throw IOException("rename failed", e)
        }
    }

    /** 原子替换：Os.rename 以单次 POSIX rename 替换已有目标或创建新目标，不经过「先删除后重命名」的空窗 */
    private fun replaceExisting(src: File, dst: File) {
        Os.rename(src.path, dst.path)
    }

    /**
     * 就地写入 tag（复用 audiotags 的 AudioTagStore，其内部通过 staging + 原子替换保证崩溃安全）。
    * 无 tags 返回 true；否则仅当 fields 及（如请求）封面均写入成功时返回 true，失败不影响已发布的完整音频
     */
    private fun embedTags(attempt: DownloadTask, finalFile: File): Boolean {
        val tags = attempt.tags ?: return true
        val ctx = appContext ?: return false
        val coverUrl = tags.coverUrl
        val requestedCover = !coverUrl.isNullOrEmpty()
        var coverTmp: File? = null
        return try {
            val coverEdit = if (!coverUrl.isNullOrEmpty()) {
                coverTmp = fetchCover(coverUrl, tags.coverHeaders, ctx)
                if (coverTmp != null) CoverEdit.Replace(coverTmp.path) else CoverEdit.Unchanged
            } else {
                CoverEdit.Unchanged
            }
            val patch = TagWritePatch(
                setFields = tags.fields.mapValues { it.value.toTypedArray() },
                removeFields = emptyArray(),
                cover = coverEdit,
            )
            val status = AudioTagStore.get(ctx).writeTags(finalFile.path, patch).status
            // 请求了封面但未成功获取，说明 fields 与封面未全部写入
            status == TagStatus.OK && (!requestedCover || coverTmp != null)
        } catch (_: Throwable) {
            false
        } finally {
            coverTmp?.let { deleteQuietly(it) }
        }
    }

    /** 在 cacheDir 中拉取封面临时文件；边读边限制 2 MiB，失败、超限或空响应均返回 null 并清理临时文件 */
    private fun fetchCover(url: String, headers: Map<String, String>, ctx: Context): File? {
        val tmp = try {
            File.createTempFile("dl-cover", null, ctx.cacheDir)
        } catch (_: Throwable) {
            return null
        }
        var ok = false
        return try {
            val builder = Request.Builder().url(url)
            headers.forEach { (k, v) -> if (k.lowercase() !in ENGINE_OWNED_HEADERS) builder.header(k, v) }
            client.newCall(builder.build()).execute().use { response ->
                val body = response.body
                if (response.isSuccessful && body != null && body.contentLength() <= COVER_MAX_BYTES) {
                    var total = 0L
                    var overflow = false
                    body.byteStream().use { input ->
                        tmp.outputStream().use { out ->
                            val buf = ByteArray(BUFFER_SIZE)
                            while (true) {
                                val n = input.read(buf)
                                if (n < 0) break
                                total += n
                                if (total > COVER_MAX_BYTES) {
                                    overflow = true
                                    break
                                }
                                out.write(buf, 0, n)
                            }
                        }
                    }
                    if (!overflow && total > 0L) ok = true
                }
            }
            if (ok) tmp else null
        } catch (_: Throwable) {
            null
        } finally {
            if (!ok) deleteQuietly(tmp)
        }
    }

    /** 尽力删除并吞掉异常；返回文件是否已不存在，供准确上报 partialRetained */
    private fun deleteQuietly(file: File): Boolean =
        try {
            !file.exists() || file.delete()
        } catch (_: Throwable) {
            false
        }

    /** 传输阶段（HTTP、body、完整性校验）的确定性失败：CAS `Active→Done(Failed)` */
    private fun failTransfer(
        attempt: DownloadTask, code: String, phase: String,
        httpStatus: Int, retryable: Boolean, message: String,
    ) {
        attempt.phase.compareAndSet(
            Phase.Active,
            Phase.Done(Outcome.Failed(code, phase, httpStatus, retryable, attempt.partFile.length() > 0, message)),
        )
    }

    /** 异常失败：可能发生在 Active（传输）或 Finalizing（发布）；从任一相位抢到 Done 才记录 */
    private fun failException(attempt: DownloadTask, e: Throwable) {
        val cls = classifyError(e)
        val fromActive = Phase.Done(Outcome.Failed(cls.code, "transfer", 0, cls.retryable, attempt.partFile.length() > 0, safeMessage(e)))
        if (attempt.phase.compareAndSet(Phase.Active, fromActive)) return
        val fromFinalizing = Phase.Done(Outcome.Failed(cls.code, "finalize", 0, cls.retryable, attempt.partFile.length() > 0, safeMessage(e)))
        attempt.phase.compareAndSet(Phase.Finalizing, fromFinalizing)
        // 均失败说明已是 Done（取消 / 已终态）→ 忽略
    }

    /**
     * 定稿阶段（Finalizing）的确定性失败（非异常）：CAS `Finalizing→Done(Failed)`
     * 上报阶段由调用方指定——嗅探与发布同在 Finalizing 相位内，但对外是两个可区分的阶段
     */
    private fun failPublish(attempt: DownloadTask, code: String, phase: String, message: String, partialRetained: Boolean) {
        attempt.phase.compareAndSet(
            Phase.Finalizing,
            Phase.Done(Outcome.Failed(code, phase, 0, false, partialRetained, message)),
        )
    }

    /**
    * 终态收尾（`cancel` 处理 `Paused` 时直接调用，或 worker finally 在 `Done` 时调用）；`terminated` 守卫通过 CAS 保证只有一个调用方执行
    * 先按终态清理文件，再注销 taskId / 路径并归还容量，最后发送唯一终态事件，确保 JS 收到事件时 taskId / 路径已释放，可立即重试
    * 前台服务名额由 worker 的 `releaseFgs` 单独释放，不在此处处理
     */
    private fun finishTerminal(attempt: DownloadTask) {
        if (!attempt.terminated.compareAndSet(false, true)) return // 另一条路径已通过 CAS 抢先收尾
        val outcome = (attempt.phase.get() as? Phase.Done)?.outcome
            ?: Outcome.Failed("unknown", "transfer", 0, false, attempt.partFile.length() > 0, "internal") // 理论不达
        // 先删 `.part` 再注销：清理完成前 taskId / 路径仍占位，杜绝并发 start 抢同一文件
        if (outcome is Outcome.Canceled && attempt.partFile.exists()) {
            attempt.partFile.delete()
        }
        // 先按 attempt 引用释放全部路径占用，再注销 active：active 注销前不会有新的同 taskId start，与本次释放交错
        reservedPaths.remove(attempt.partKey, attempt)
        reservedPaths.remove(attempt.nameKey, attempt)
        attempt.committedNameKey?.let { reservedPaths.remove(it, attempt) }
        active.remove(attempt.taskId, attempt)
        capacity.release()
        when (outcome) {
            is Outcome.Completed -> {
                // 先落盘回执再 emit：进程在 emit 后、JS 入账前被杀时回执留存，App 重启经 getUnackedCompletions 重放
                receiptStore?.write(
                    ReceiptStore.Receipt(
                        attempt.taskId, attempt.contentKey,
                        outcome.path, outcome.ext, outcome.size, outcome.taggedOk,
                    ),
                )
                flushProgress(attempt)
                emitSafely {
                    it.onComplete(
                        attempt.taskId, attempt.attemptId, attempt.contentKey,
                        outcome.path, outcome.ext, outcome.size, outcome.taggedOk,
                    )
                }
            }
            is Outcome.Failed -> {
                flushProgress(attempt)
                emitSafely {
                    it.onError(
                        attempt.taskId, attempt.attemptId, outcome.code, outcome.phase,
                        outcome.httpStatus, outcome.retryable, outcome.partialRetained, outcome.message,
                    )
                }
            }
            is Outcome.Canceled -> emitSafely { it.onCanceled(attempt.taskId, attempt.attemptId) }
        }
    }

    private fun maybeEmitProgress(attempt: DownloadTask) {
        val now = SystemClock.elapsedRealtime()
        if (now - attempt.lastEmitMs >= progressIntervalMs) {
            attempt.lastEmitMs = now
            emitSafely { it.onProgress(attempt.taskId, attempt.attemptId, attempt.downloaded, attempt.total) }
        }
    }

    /** 强制补发一次当前进度（终态前，确保 JS 不停留在上一间隔的旧值） */
    private fun flushProgress(attempt: DownloadTask) {
        attempt.lastEmitMs = SystemClock.elapsedRealtime()
        emitSafely { it.onProgress(attempt.taskId, attempt.attemptId, attempt.downloaded, attempt.total) }
    }

    /** 事件投递异常与网络 / 文件失败隔离：桥失效时静默丢弃，不改变传输终态 */
    private fun emitSafely(block: (Listener) -> Unit) {
        val listener = listenerRef.get() ?: return
        try {
            block(listener)
        } catch (_: Throwable) {
            // JS 桥已失效；完成回执已在 finishTerminal 落盘，App 重连经 getUnackedCompletions 重放补偿
        }
    }

    /** 剥离调用方传入的引擎自有 header（大小写不敏感），即 Range 与 Accept-Encoding，其余透传 */
    private fun sanitizeHeaders(headers: Map<String, String>): Map<String, String> =
        headers.filterKeys { it.lowercase() !in ENGINE_OWNED_HEADERS }

    private fun isRetryableHttp(httpStatus: Int): Boolean =
        httpStatus == 408 || httpStatus == 429 || httpStatus in 500..599

    /** 沿 cause 链按操作边界分类：磁盘满与权限错误不可重试，网络瞬断可重试，证书与握手错误无需重试 */
    private fun classifyError(e: Throwable): ErrorClass {
        var cur: Throwable? = e
        while (cur != null) {
            when (cur) {
                is ErrnoException -> return when (cur.errno) {
                    OsConstants.ENOSPC -> ErrorClass("diskFull", false)
                    OsConstants.EACCES, OsConstants.EPERM, OsConstants.EROFS -> ErrorClass("permission", false)
                    else -> ErrorClass("io", false)
                }
                is SSLHandshakeException, is SSLPeerUnverifiedException -> return ErrorClass("network", false)
                is UnknownHostException, is ConnectException, is SocketException,
                is SSLException, is EOFException, is ProtocolException,
                is InterruptedIOException -> return ErrorClass("network", true)
                is SecurityException -> return ErrorClass("permission", false)
            }
            cur = cur.cause
        }
        return if (e is IOException) ErrorClass("io", false) else ErrorClass("unknown", false)
    }

    /** 诊断信息只取异常类型名，绝不回显带签名 query 的 URL 或敏感 header 值 */
    private fun safeMessage(e: Throwable): String = e.javaClass.simpleName

    /** 严格解析 `bytes start-end/total`：要求 start≤end、（total 已知时）end<total，任一不符返回 null */
    private fun parseContentRange(header: String?): ContentRange? {
        val spec = header?.trim() ?: return null
        if (!spec.startsWith("bytes")) return null
        val body = spec.removePrefix("bytes").trim()
        val slash = body.indexOf('/')
        if (slash < 0) return null
        val rangePart = body.substring(0, slash)
        val totalPart = body.substring(slash + 1).trim()
        val dash = rangePart.indexOf('-')
        if (dash < 0) return null
        val start = rangePart.substring(0, dash).trim().toLongOrNull() ?: return null
        val end = rangePart.substring(dash + 1).trim().toLongOrNull() ?: return null
        if (start > end) return null
        val total = if (totalPart == "*") {
            null
        } else {
            val t = totalPart.toLongOrNull() ?: return null
            if (end >= t) return null
            t
        }
        return ContentRange(start, end, total)
    }

    /** 解析 416 响应 `Content-Range` 斜杠后的完整长度；缺失、非法或区间部分不是 `*` 时返回 null */
    private fun parseUnsatisfiedRangeTotal(header: String?): Long? {
        val spec = header?.trim() ?: return null
        if (!spec.startsWith("bytes")) return null
        val body = spec.removePrefix("bytes").trim()
        val slash = body.indexOf('/')
        if (slash < 0) return null
        if (body.substring(0, slash).trim() != "*") return null // 416 的区间部分应为 *，不能包含具体区间
        return body.substring(slash + 1).trim().toLongOrNull()
    }

    /** 嗅探失败时的回退扩展名推断：优先 Content-Type，其次 URL 后缀，最后回退 mp3 */
    private fun deriveExtension(contentType: String?, url: String): String {
        when (contentType?.substringBefore(';')?.trim()?.lowercase()) {
            "audio/mpeg", "audio/mp3" -> return "mp3"
            "audio/aac" -> return "aac"
            "audio/mp4", "audio/x-m4a" -> return "m4a"
            "audio/flac", "audio/x-flac" -> return "flac"
            "audio/ogg", "application/ogg" -> return "ogg"
            "audio/wav", "audio/x-wav" -> return "wav"
        }
        val suffix = url.substringBefore('?').substringBefore('#').substringAfterLast('.', "")
            .lowercase()
        return if (suffix.length in 1..4 && suffix.all { it.isLetterOrDigit() }) suffix else "mp3"
    }
}
