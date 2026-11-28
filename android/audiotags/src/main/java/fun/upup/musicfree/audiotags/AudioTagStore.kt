package `fun`.upup.musicfree.audiotags

import android.app.ActivityManager
import android.content.Context
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.system.Os
import android.system.OsConstants
import java.io.File
import java.io.FileNotFoundException
import java.io.OutputStream
import java.io.RandomAccessFile
import java.util.concurrent.Executors
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/** tag 操作状态：0–5 复用 TagLibNative（native）；100+ 为 store 级 */
object TagStatus {
    const val OK = TagLibNative.OK
    const val NOT_OPEN = TagLibNative.NOT_OPEN
    const val UNSUPPORTED = TagLibNative.UNSUPPORTED
    const val FIELDS_REJECTED = TagLibNative.FIELDS_REJECTED
    const val IO = TagLibNative.IO
    const val INVALID_ARG = TagLibNative.INVALID_ARG

    const val NOT_FOUND = 100
    const val PERMISSION = 101
    const val NOT_WRITABLE = 102
    const val RECOVERY_FAILED = 103
}

/** 封面写操作：文件路径进图（字节只在原生侧流转） */
sealed interface CoverEdit {
    data object Unchanged : CoverEdit
    data object Remove : CoverEdit
    data class Replace(val imagePath: String) : CoverEdit
}

/** 写入补丁：未传的键不动 */
data class TagWritePatch(
    val setFields: Map<String, Array<String>> = emptyMap(),
    val removeFields: Array<String> = emptyArray(),
    val cover: CoverEdit = CoverEdit.Unchanged,
)

/** 写结果：状态 + 写后回读快照（成功时） */
data class TagWriteResult(val status: Int, val snapshot: TagReadResult?, val backupPath: String? = null)

/** 提取封面结果：状态 + 落地文件（无封面时 file=null 且 status=OK） */
data class CoverExtractResult(val status: Int, val file: CoverFile?)

data class CoverFile(val path: String, val mime: String, val byteCount: Int)

/**
 * RN-free 的音频 tag 写引擎：前台 TurboModule 与后台 Service 共用（期望进程级单例）
 * 写安全：
 * - path：同目录 staging + 原子 rename（target 仅在 rename 时改变，真原子替换）
 * - content://：copy-in + 备份 + 回写 + 进程存活期内尽力恢复（非进程崩溃级原子；provider 无通用原子替换）
 * 方法阻塞式（调用方在自己后台线程调）；batch 内部用池并行；按文件（striped 锁）串行
 */
class AudioTagStore internal constructor(context: Context) {

    private val appContext = context.applicationContext
    private val cacheDir: File = File(appContext.cacheDir, "audiotags").apply { mkdirs() }

    val readConcurrency: Int

    // 固定条纹锁：按 fileLocation 规范化 key 哈希分桶，容量有界（避免扫全库时锁表无限增长）
    private val stripes = Array(32) { ReentrantLock() }
    private val batchPool by lazy { Executors.newFixedThreadPool(readConcurrency) }

    init {
        val cores = Runtime.getRuntime().availableProcessors()
        val am = appContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val lowRam = am.isLowRamDevice
        readConcurrency = if (lowRam) 2 else cores.coerceIn(3, 6)
    }

    // —— 读 ——

    fun readTags(fileLocation: String): TagReadResult = withSourceLock(fileLocation) { doReadTags(fileLocation) }

    /** 批量读：池内并行 fan-out；逐项独立结果（一个坏文件不拖垮整批） */
    fun readTagsBatch(fileLocations: List<String>): List<TagReadResult> {
        if (fileLocations.isEmpty()) return emptyList()
        val futures = fileLocations.map { fl -> batchPool.submit<TagReadResult> { readTags(fl) } }
        val results = ArrayList<TagReadResult>(futures.size)
        for ((idx, f) in futures.withIndex()) {
            // 调用线程被中断（如扫描取消）：cancel 尚未开始的剩余任务、避免空转读完整批
            // 已在 JNI 里读的（≤readConcurrency 个）取消不了、会读完（native 阻塞不可中断）
            if (Thread.currentThread().isInterrupted) {
                for (j in idx until futures.size) {
                    futures[j].cancel(true)
                    results.add(errRead(TagStatus.IO))
                }
                break
            }
            results.add(
                try {
                    f.get()
                } catch (e: InterruptedException) {
                    Thread.currentThread().interrupt()
                    f.cancel(true) // 当前 future 可能仍在队列未执行，一并取消
                    errRead(TagStatus.IO)
                } catch (_: Exception) {
                    errRead(TagStatus.IO)
                },
            )
        }
        return results
    }

    fun extractPrimaryCover(fileLocation: String, destPath: String): CoverExtractResult =
        withSourceLock(fileLocation) {
            val src = parse(fileLocation)
            // 防手滑：dest 与 path 源文件同一个 → 会用封面字节覆盖音频，拒绝
            if (src is Source.Path && sameFile(src.file, File(destPath))) {
                return@withSourceLock CoverExtractResult(TagStatus.INVALID_ARG, null)
            }
            val cover = when (src) {
                is Source.Path -> {
                    if (!src.file.isFile) return@withSourceLock CoverExtractResult(TagStatus.NOT_FOUND, null)
                    try {
                        TagLibNative.readPrimaryCover(openReadFd(src.file))
                    } catch (_: SecurityException) {
                        return@withSourceLock CoverExtractResult(TagStatus.PERMISSION, null)
                    } catch (_: Exception) {
                        return@withSourceLock CoverExtractResult(TagStatus.IO, null)
                    }
                }
                is Source.Content -> withContentCopy(
                    src.uri, "cover",
                    onOk = { TagLibNative.readPrimaryCover(openReadFd(it)) },
                    onErr = { return@withSourceLock CoverExtractResult(it, null) },
                )
                is Source.Invalid ->
                    return@withSourceLock CoverExtractResult(TagStatus.INVALID_ARG, null)
            }
            if (cover.errorCode != TagLibNative.OK) {
                return@withSourceLock CoverExtractResult(cover.errorCode, null)
            }
            val bytes = cover.cover ?: return@withSourceLock CoverExtractResult(TagStatus.OK, null)
            val dest = File(destPath)
            val tmp = File(dest.parentFile, ".${dest.name}.${System.nanoTime()}.tmp")
            try {
                tmp.outputStream().use { it.write(bytes.data) }
                if (!tmp.renameTo(dest)) return@withSourceLock CoverExtractResult(TagStatus.IO, null)
            } catch (_: Exception) {
                return@withSourceLock CoverExtractResult(TagStatus.IO, null)
            } finally {
                tmp.delete()  // rename 成功后 tmp 已不在（无害）；失败/异常则清理，杜绝泄漏
            }
            CoverExtractResult(TagStatus.OK, CoverFile(destPath, bytes.mime, bytes.data.size))
        }

    private fun doReadTags(fileLocation: String): TagReadResult = when (val s = parse(fileLocation)) {
        is Source.Path -> {
            if (!s.file.isFile) {
                errRead(TagStatus.NOT_FOUND)
            } else {
                try {
                    TagLibNative.readTags(openReadFd(s.file))
                } catch (_: SecurityException) {
                    errRead(TagStatus.PERMISSION)
                } catch (_: Exception) {
                    errRead(TagStatus.IO)
                }
            }
        }
        is Source.Content -> withContentCopy(
            s.uri, "read",
            onOk = { TagLibNative.readTags(openReadFd(it)) },
            onErr = { errRead(it) },
        )
        is Source.Invalid -> errRead(TagStatus.INVALID_ARG)
    }

    // —— 写 ——

    fun writeTags(fileLocation: String, patch: TagWritePatch): TagWriteResult = withSourceLock(fileLocation) {
        if (isNoop(patch)) {
            // no-op：不打开、不重写文件，仅回读
            val snap = doReadTags(fileLocation)
            return@withSourceLock TagWriteResult(snap.errorCode, snap.takeIf { it.errorCode == TagStatus.OK })
        }
        val resolved = try {
            resolvePatch(patch)
        } catch (_: IllegalArgumentException) {
            return@withSourceLock TagWriteResult(TagStatus.INVALID_ARG, null)  // patch 非法：封面不存在/超限/格式未知
        } catch (_: SecurityException) {
            return@withSourceLock TagWriteResult(TagStatus.PERMISSION, null)   // 读封面图无权限
        } catch (_: Exception) {
            return@withSourceLock TagWriteResult(TagStatus.IO, null)           // 读封面图 IO 错误
        }
        when (val s = parse(fileLocation)) {
            is Source.Path -> writePath(s.file, resolved)
            is Source.Content -> writeContent(s.uri, resolved)
            is Source.Invalid -> TagWriteResult(TagStatus.INVALID_ARG, null)
        }
    }

    // path 写：copy 到同目录 staging → 改 → 校验 → 原子 rename。target 只在 rename 时改变，天然安全
    private fun writePath(target: File, patch: ResolvedPatch): TagWriteResult {
        if (!target.isFile) return TagWriteResult(TagStatus.NOT_FOUND, null)
        val staging = File(target.parentFile, ".${target.name}.tag.${System.nanoTime()}.tmp")
        try {
            copyFile(target, staging)
            val status = TagLibNative.writeTags(
                openWriteFd(staging), patch.setFields, patch.removeFields,
                patch.coverOp, patch.cover, patch.coverMime,
            )
            if (status != TagStatus.OK && status != TagStatus.FIELDS_REJECTED) {
                return TagWriteResult(status, null)
            }
            // 校验即取快照：staging 解析成功的读结果就是提交后内容（rename 后 target == staging）
            val committed = TagLibNative.readTags(openReadFd(staging))
            if (committed.errorCode != TagStatus.OK) return TagWriteResult(TagStatus.IO, null)
            fsyncFile(staging)
            if (!staging.renameTo(target)) return TagWriteResult(TagStatus.IO, null)
            fsyncDir(target.parentFile)
            // 成功必带真实快照（不再事后回读 target，杜绝「成功却报空 tag」）
            return TagWriteResult(status, committed)
        } catch (_: SecurityException) {
            return TagWriteResult(TagStatus.PERMISSION, null)  // rename 前失败 → target 未变
        } catch (_: Exception) {
            return TagWriteResult(TagStatus.IO, null)          // rename 前失败 → target 未变
        } finally {
            staging.delete()
        }
    }

    // content 写：copy-in → 备份 → 改 staging → 校验 → 回写 uri；提交阶段失败尽力恢复
    private fun writeContent(uri: Uri, patch: ResolvedPatch): TagWriteResult {
        val staging = tempFile("work")
        val backup = tempFile("backup")
        var commitStarted = false
        var keepBackup = false
        try {
            val copied = try {
                copyIn(uri, staging)
            } catch (_: SecurityException) {
                return TagWriteResult(TagStatus.PERMISSION, null)
            } catch (_: FileNotFoundException) {
                return TagWriteResult(TagStatus.NOT_FOUND, null)
            } catch (_: Exception) {
                return TagWriteResult(TagStatus.IO, null)
            }
            if (!copied) return TagWriteResult(TagStatus.NOT_FOUND, null)
            copyFile(staging, backup)  // 抛异常 → 下方 catch，commitStarted 仍 false → 不恢复（uri 未动）
            val status = TagLibNative.writeTags(
                openWriteFd(staging), patch.setFields, patch.removeFields,
                patch.coverOp, patch.cover, patch.coverMime,
            )
            if (status != TagStatus.OK && status != TagStatus.FIELDS_REJECTED) {
                return TagWriteResult(status, null)
            }
            if (!validates(staging)) return TagWriteResult(TagStatus.IO, null)

            // 开写流：打不开视作不可写（uri 未动）；开成功即已截断，进入提交阶段
            val out = openWriteStream(uri) ?: return TagWriteResult(TagStatus.NOT_WRITABLE, null)
            commitStarted = true
            out.use { o -> staging.inputStream().use { it.copyTo(o) } }

            // 提交后回读校验
            val snapshot = withContentCopy(
                uri, "verify",
                onOk = { doReadTags(it.absolutePath) },
                onErr = { errRead(it) },
            )
            if (snapshot.errorCode != TagStatus.OK) {
                keepBackup = !restore(backup, uri)
                return if (keepBackup) {
                    TagWriteResult(TagStatus.RECOVERY_FAILED, null, preserveBackup(backup))
                } else {
                    TagWriteResult(TagStatus.IO, null)
                }
            }
            return TagWriteResult(status, snapshot)
        } catch (e: Exception) {
            if (!commitStarted) {
                return TagWriteResult(
                    if (e is SecurityException) TagStatus.PERMISSION else TagStatus.IO, null,
                )
            }
            keepBackup = !restore(backup, uri)
            return if (keepBackup) {
                TagWriteResult(TagStatus.RECOVERY_FAILED, null, preserveBackup(backup))
            } else {
                TagWriteResult(TagStatus.IO, null)
            }
        } finally {
            staging.delete()
            if (!keepBackup) backup.delete()  // 恢复成功才删；RECOVERY_FAILED 时 preserveBackup 已挪走
        }
    }

    // —— fileLocation 解析 ——

    private sealed interface Source {
        data class Path(val file: File) : Source
        data class Content(val uri: Uri) : Source
        data object Invalid : Source
    }

    private fun parse(fileLocation: String): Source = when {
        fileLocation.startsWith("content://") -> Source.Content(Uri.parse(fileLocation))
        fileLocation.startsWith("file://") -> Source.Path(File(Uri.parse(fileLocation).path.orEmpty()))
        fileLocation.startsWith("/") -> Source.Path(File(fileLocation))
        else -> Source.Invalid
    }

    private fun lockKey(fileLocation: String): String = when (val s = parse(fileLocation)) {
        is Source.Path -> runCatching { s.file.canonicalPath }.getOrDefault(s.file.absolutePath)
        is Source.Content -> s.uri.toString()
        is Source.Invalid -> fileLocation
    }

    private inline fun <T> withSourceLock(fileLocation: String, block: () -> T): T {
        val key = lockKey(fileLocation)
        val lock = stripes[(key.hashCode() and 0x7fffffff) % stripes.size]
        return lock.withLock(block)
    }

    /** 两个 File 是否指向同一实体（规范化路径比较，失败回退绝对路径） */
    private fun sameFile(a: File, b: File): Boolean =
        runCatching { a.canonicalPath == b.canonicalPath }.getOrDefault(a.absolutePath == b.absolutePath)

    // —— staging / IO 辅助 ——

    private fun tempFile(tag: String): File = File(cacheDir, "$tag.${System.nanoTime()}.tmp")

    /** content 读/校验：copy-in 到临时文件跑 onOk，失败经 onErr 映射状态，最后清理 */
    private inline fun <T> withContentCopy(uri: Uri, tag: String, onOk: (File) -> T, onErr: (Int) -> T): T {
        val temp = tempFile(tag)
        try {
            val ok = try {
                copyIn(uri, temp)
            } catch (_: SecurityException) {
                return onErr(TagStatus.PERMISSION)
            } catch (_: FileNotFoundException) {
                return onErr(TagStatus.NOT_FOUND)
            } catch (_: Exception) {
                return onErr(TagStatus.IO)
            }
            return if (ok) onOk(temp) else onErr(TagStatus.NOT_FOUND)
        } finally {
            temp.delete()
        }
    }

    private fun copyIn(uri: Uri, dest: File): Boolean {
        val input = appContext.contentResolver.openInputStream(uri) ?: return false
        input.use { dest.outputStream().use { out -> input.copyTo(out) } }
        return true
    }

    private fun copyFile(src: File, dest: File) {
        src.inputStream().use { input -> dest.outputStream().use { input.copyTo(it) } }
    }

    private fun openWriteStream(uri: Uri): OutputStream? = try {
        appContext.contentResolver.openOutputStream(uri, "wt")
    } catch (e: SecurityException) {
        throw e  // 权限问题上抛，由 writeContent 映射 PERMISSION（不吞成 NOT_WRITABLE）
    } catch (_: Exception) {
        null
    }

    private fun restore(backup: File, uri: Uri): Boolean = try {
        appContext.contentResolver.openOutputStream(uri, "wt")?.use { out ->
            backup.inputStream().use { it.copyTo(out) }
            true
        } ?: false
    } catch (_: Exception) {
        false
    }

    /** 恢复失败时把备份挪到持久恢复区（filesDir，不随 cache 清理丢失），返回其路径供后续恢复 */
    private fun preserveBackup(backup: File): String {
        val dir = File(appContext.filesDir, "audiotags/recovery").apply { mkdirs() }
        val kept = File(dir, "recovery.${System.nanoTime()}.bak")
        return try {
            if (!backup.renameTo(kept)) {
                copyFile(backup, kept)
                backup.delete()
            }
            kept.absolutePath
        } catch (_: Exception) {
            backup.absolutePath  // 挪不动就留在原位，至少返回可定位路径
        }
    }

    private fun openReadFd(file: File): Int =
        ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).detachFd()

    private fun openWriteFd(file: File): Int =
        ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_WRITE).detachFd()

    private fun fsyncFile(file: File) {
        RandomAccessFile(file, "rw").use { it.fd.sync() }
    }

    private fun fsyncDir(dir: File?) {
        if (dir == null) return
        try {
            val dfd = Os.open(dir.absolutePath, OsConstants.O_RDONLY, 0)
            try {
                Os.fsync(dfd)
            } finally {
                Os.close(dfd)
            }
        } catch (_: Exception) {
            // 目录 fsync 失败不致命（某些 fs 不支持）
        }
    }

    /** 写后校验：staging 仍能被解析（tag 可读、非损坏） */
    private fun validates(staging: File): Boolean =
        TagLibNative.readTags(openReadFd(staging)).errorCode == TagLibNative.OK

    private fun errRead(status: Int): TagReadResult =
        TagReadResult(status, emptyMap(), AudioProps(0, 0, 0, 0), false)

    private fun isNoop(patch: TagWritePatch): Boolean =
        patch.setFields.isEmpty() && patch.removeFields.isEmpty() && patch.cover == CoverEdit.Unchanged

    // —— patch 解析（封面路径 → 字节 + mime）——

    private class ResolvedPatch(
        val setFields: Map<String, Array<String>>,
        val removeFields: Array<String>,
        val coverOp: Int,
        val cover: ByteArray?,
        val coverMime: String?,
    )

    private fun resolvePatch(patch: TagWritePatch): ResolvedPatch = when (val c = patch.cover) {
        CoverEdit.Unchanged ->
            ResolvedPatch(patch.setFields, patch.removeFields, TagLibNative.COVER_UNCHANGED, null, null)
        CoverEdit.Remove ->
            ResolvedPatch(patch.setFields, patch.removeFields, TagLibNative.COVER_REMOVE, null, null)
        is CoverEdit.Replace -> {
            val f = File(c.imagePath)
            require(f.isFile) { "cover not a file" }
            require(f.length() in 1..MAX_COVER_BYTES) { "cover size out of range" }
            val bytes = f.readBytes()
            val mime = detectImageMime(bytes) ?: throw IllegalArgumentException("unknown image format")
            ResolvedPatch(patch.setFields, patch.removeFields, TagLibNative.COVER_REPLACE, bytes, mime)
        }
    }

    private fun detectImageMime(b: ByteArray): String? = when {
        b.size >= 3 && b[0] == 0xFF.toByte() && b[1] == 0xD8.toByte() && b[2] == 0xFF.toByte() -> "image/jpeg"
        b.size >= 8 && b[0] == 0x89.toByte() && b[1] == 0x50.toByte() &&
            b[2] == 0x4E.toByte() && b[3] == 0x47.toByte() -> "image/png"
        b.size >= 12 && b[0] == 0x52.toByte() && b[1] == 0x49.toByte() &&
            b[2] == 0x46.toByte() && b[3] == 0x46.toByte() && b[8] == 0x57.toByte() &&
            b[9] == 0x45.toByte() && b[10] == 0x42.toByte() && b[11] == 0x50.toByte() -> "image/webp"
        b.size >= 6 && b[0] == 0x47.toByte() && b[1] == 0x49.toByte() && b[2] == 0x46.toByte() -> "image/gif"
        else -> null
    }

    companion object {
        private const val MAX_COVER_BYTES = 30L * 1024 * 1024

        @Volatile
        private var instance: AudioTagStore? = null

        /** 进程级单例：前台 TurboModule 与后台 Service 共享同一 batch 池 + striped 锁 */
        fun get(context: Context): AudioTagStore =
            instance ?: synchronized(this) {
                instance ?: AudioTagStore(context.applicationContext).also { instance = it }
            }
    }
}
