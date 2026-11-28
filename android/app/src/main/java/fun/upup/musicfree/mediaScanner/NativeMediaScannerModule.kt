package `fun`.upup.musicfree.mediaScanner

import android.os.Environment
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import `fun`.upup.musicfree.specs.NativeMediaScannerSpec
import `fun`.upup.musicfree.audiotags.AudioTagStore
import `fun`.upup.musicfree.audiotags.TagReadResult
import `fun`.upup.musicfree.audiotags.TagStatus
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.atomic.AtomicInteger
import org.json.JSONObject

/**
 * 本地音乐扫描 TurboModule：递归枚举 → 指纹增量（跳过未变）→ 复用 AudioTagStore 并发读 tag → 分批 emit
 * 单后台线程编排（枚举/分批/差量），读 tag 委托 AudioTagStore 的池；scanId 代次防迟到事件
 * 业务（转 MusicItem / 落库 / UI）在 core/localMusic；NativeMediaScannerSpec 由 codegen 生成、首次 build 后才有
 */
@ReactModule(name = NativeMediaScannerModule.NAME)
class NativeMediaScannerModule(reactContext: ReactApplicationContext) :
    NativeMediaScannerSpec(reactContext) {

    private val tagStore = AudioTagStore.get(reactContext)
    private val scanExecutor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    // 活跃代次：startScan 置新值、cancelScan 匹配则作废（-1）；扫描循环每步核对，作废即停、不再发事件
    private val activeScanId = AtomicInteger(-1)

    // 当前扫描任务：新扫描/取消时中断它（打断卡在读 tag 的批，及时让位）
    @Volatile
    private var currentTask: Future<*>? = null

    // 实例已销毁：拦截销毁后仍在途的枚举与事件
    @Volatile
    private var destroyed = false

    override fun startScan(options: ReadableMap) {
        // 轻量读入参（ReadableMap 不能跨线程持有）；大指纹 JSON 只取字符串、解析留给扫描线程
        val scanId = options.getInt("scanId")
        val roots = options.getArray("roots").toStringList()
        val excludedDirs = options.getArray("excludedDirs").toStringList()
        val extensions =
            options.getArray("extensions").toStringList().map { it.lowercase() }.toHashSet()
        val minDurationMs = (options.getDouble("minDurationSec") * 1000).toLong()
        val minSizeBytes = options.getDouble("minSizeBytes").toLong()
        val knownJson = options.getString("knownFingerprintsJson")
        val batchSize = options.getInt("batchSize").coerceIn(1, MAX_BATCH)
        // 旧标签乱码的修复码表（空串=不修）；由 JS 按应用语言决定，见 LegacyTagText
        val legacyTagCharset = options.getString("legacyTagCharset").orEmpty()
        // 抢占上一次扫描：中断 + 进新代次
        currentTask?.cancel(true)
        activeScanId.set(scanId)
        currentTask = scanExecutor.submit {
            runScan(
                scanId, roots, excludedDirs, extensions,
                minDurationMs, minSizeBytes, knownJson, batchSize, legacyTagCharset,
            )
        }
    }

    override fun cancelScan(scanId: Double) {
        if (activeScanId.compareAndSet(scanId.toInt(), -1)) currentTask?.cancel(true)
    }

    override fun invalidate() {
        destroyed = true
        activeScanId.set(-1)
        currentTask?.cancel(true)
        mainHandler.removeCallbacksAndMessages(null)
        scanExecutor.shutdownNow()
        super.invalidate()
    }

    private fun runScan(
        scanId: Int,
        roots: List<String>,
        excludedDirs: List<String>,
        extensions: Set<String>,
        minDurationMs: Long,
        minSizeBytes: Long,
        knownJson: String?,
        batchSize: Int,
        legacyTagCharset: String,
    ) {
        try {
            if (roots.isEmpty()) {
                emitError(scanId, "E_IO", "no scan roots")
                return
            }
            // 指纹解析放扫描线程（大 JSON 不阻塞 native 调用队列）
            val known = parseFingerprints(knownJson)

            // 阶段 1：枚举候选（快照 canonical/mtime/size/folder，各算一次）
            // 同时记录不可信子树（无效 root / 读不了的目录）：其下已知路径不参与删除，防瞬时失败误删
            val enumResult = enumerate(scanId, roots, excludedDirs, extensions, minSizeBytes)
            if (!isActive(scanId)) return
            val candidates = enumResult.files
            val untrusted = enumResult.untrustedPrefixes
            val trustedRoots = enumResult.trustedRoots

            // 指纹增量：一致的复用旧缓存（reused）、变化/新增的待读 tag
            val toRead = ArrayList<Candidate>()
            val retained = HashSet<String>(candidates.size) // 复用 + 读成功且通过过滤=库中保留
            var reused = 0
            for (c in candidates) {
                if (known[c.path] == "${c.mtimeMs}:${c.sizeBytes}") {
                    reused++
                    retained.add(c.path)
                } else {
                    toRead.add(c)
                }
            }

            val total = toRead.size
            var processed = 0
            var tagsRead = 0
            val failed = HashSet<String>()

            // 阶段 2：分批读 tag + emit
            var i = 0
            while (i < toRead.size) {
                if (!isActive(scanId)) return
                val end = minOf(i + batchSize, toRead.size)
                val slice = toRead.subList(i, end)
                val results = tagStore.readTagsBatch(slice.map { it.path })
                if (!isActive(scanId)) return // 取消/被抢占：当前批结果丢弃、不再处理
                val batch = Arguments.createArray()
                for ((idx, c) in slice.withIndex()) {
                    val r = results[idx]
                    if (r.errorCode != TagStatus.OK) {
                        if (r.errorCode == TagStatus.UNSUPPORTED) {
                            // TagLib 无法识别（标签畸形如双 ID3 堆叠、或真损坏/非常规文件）：重试无用
                            // best-effort 兜底：扩展名匹配但读不出标签的仍用文件名进库、不漏歌（能否播由播放器定）
                            retained.add(c.path)
                            batch.pushMap(fileToMap(c, r, 0L, legacyTagCharset)) // r.fields 空 → fileToMap 内 title 自动回退文件名
                        } else {
                            // 瞬时失败（IO 等）：保留旧缓存、不误删、下次重试
                            failed.add(c.path)
                        }
                        continue
                    }
                    tagsRead++ // 读到 tag 即计（时长过滤前）
                    val durationMs = r.audio.durationMs
                    // 时长过滤（读 tag 后才知）：不进 retained → 若曾在库（如文件变短）会被差量删除
                    if (minDurationMs > 0L && durationMs in 1L until minDurationMs) continue
                    retained.add(c.path)
                    batch.pushMap(fileToMap(c, r, durationMs, legacyTagCharset))
                }
                processed += slice.size
                i = end
                emitProgress(scanId, batch, processed, total, slice.last().folderPath)
            }
            if (!isActive(scanId)) return

            // 差量：known 里既非保留、非读失败、且不在不可信子树下的 → 确认删除
            val removed = Arguments.createArray()
            for (p in known.keys) {
                if (p in retained || p in failed) continue
                if (isUnderUntrusted(p, untrusted, trustedRoots)) continue
                removed.pushString(p)
            }
            val failedArr = Arguments.createArray()
            failed.forEach { failedArr.pushString(it) }
            emitComplete(scanId, removed, failedArr, tagsRead, reused)
        } catch (e: Exception) {
            if (isActive(scanId)) emitError(scanId, "E_UNKNOWN", e.message ?: "scan failed")
        }
    }

    /** 枚举出的候选：快照 canonical path/folder/mtime/size，避免后续重复 stat 与 canonical 解析 */
    private class Candidate(
        val path: String,
        val folderPath: String,
        val mtimeMs: Long,
        val sizeBytes: Long,
        val extension: String,
        val file: File,
    )

    /** 枚举结果：候选 + 不可信子树前缀 + 已确认可读的扫描根（豁免嵌套在 Android/data 等不可列祖先下的应用私有下载目录） */
    private class EnumResult(
        val files: List<Candidate>,
        val untrustedPrefixes: List<String>,
        val trustedRoots: Set<String>,
    )

    // 递归枚举（栈驱动、去重、排除段边界、扩展名 + minSize 过滤）；读不了的子树记入不可信
    private fun enumerate(
        scanId: Int,
        roots: List<String>,
        excludedDirs: List<String>,
        extensions: Set<String>,
        minSizeBytes: Long,
    ): EnumResult {
        val out = ArrayList<Candidate>()
        val seen = HashSet<String>()
        val untrusted = ArrayList<String>()
        // 排除按 root 作用域：只应用严格位于该 root 之下的排除项，等于 / 高于 root 的排除项不否决它；
        // 否则用户排除一个祖先目录就会连带干掉调用方刚刚明确要求扫的 root 及其子目录
        // 栈是 LIFO：靠后给的 root 先处理，故嵌套在其他 root 子树里的专用 root 应放在 roots 末尾
        //
        // 排除项与 root 一样先 canonical 化再比对：root 是 canonical 的，若某个卷根是符号链接
        // （少数机型的 /storage/sdcardN），原样排除项永远匹配不上该 root 的前缀，
        // 于是「排除了却照扫」——两边身份必须同源
        val stack = ArrayDeque<Pair<File, String>>()
        val excludedByRoot = HashMap<String, List<String>>()
        // 所有 root 的身份集：.nomedia 豁免按「它是不是某个 root」判，而不是按出栈时携带的 root——
        // 嵌套 root 若先被外层 root 的遍历走到，用位置判会把用户明确指定的目录整棵跳掉
        val rootPaths = HashSet<String>()
        val canonicalExcluded = excludedDirs.map { ex ->
            File(ex).canonicalPathOrNull() ?: ex
        }
        for (r in roots) {
            val rf = File(r)
            val rp = rf.canonicalPathOrNull() ?: rf.absolutePath
            if (rf.isDirectory) {
                rootPaths.add(rp)
                stack.addLast(rf to rp)
                excludedByRoot[rp] = canonicalExcluded.filter { it.startsWith("$rp/") }
            } else if (!rf.exists() && isMissingSubdirOnMountedVolume(rf)) {
                // 指定的子目录自身已被删空，且所属存储卷确认已挂载、父目录可读：记为已确认空根以结算其下旧条目
                rootPaths.add(rp)
            } else {
                // 无效/不可达 root：其下旧路径不删（卷临时卸载优于误删）
                untrusted.add(rp)
            }
        }
        while (stack.isNotEmpty()) {
            if (!isActive(scanId)) return EnumResult(out, untrusted, emptySet())
            val (dir, rootPath) = stack.removeLast()
            val dp = dir.canonicalPathOrNull() ?: dir.absolutePath
            if (!seen.add(dp)) continue
            if (isExcluded(dp, excludedByRoot[rootPath].orEmpty())) continue
            val children = dir.listFiles()
            if (children == null) {
                // 目录存在但读不了（权限瞬断等）：其下旧路径不删
                untrusted.add(dp)
                continue
            }
            // Android 约定：带 .nomedia 的目录整棵不当媒体（录音、通知音、缓存图都靠它躲开媒体库）。
            // 用户明确指定的 root 例外——既然指了就是要扫。其下曾入库的条目走普通差量结算（与系统
            // 媒体库对 .nomedia 的处理一致；祖先若本轮不可信则照旧保留，不为此另开一条通道）。
            // 标记从刚列出的 children 里找，不为它多付一次 stat；忽略大小写以兼容 FAT/exFAT 卷
            if (
                dp !in rootPaths &&
                children.any { it.name.equals(NOMEDIA_MARKER, ignoreCase = true) }
            ) {
                continue
            }
            for (c in children) {
                if (c.isDirectory) {
                    stack.addLast(c to rootPath)
                } else if (c.extension.lowercase() in extensions && c.length() >= minSizeBytes) {
                    // 身份用严格 canonical；解析失败则跳过（不回退 absolute，守 id 契约）
                    val cp = c.canonicalPathOrNull() ?: continue
                    out.add(
                        Candidate(cp, dp, c.lastModified(), c.length(), c.extension.lowercase(), c),
                    )
                }
            }
        }
        val untrustedSet = untrusted.toHashSet()
        val trustedRoots = rootPaths.filterTo(HashSet()) { it !in untrustedSet }
        return EnumResult(out, untrusted, trustedRoots)
    }

    // 缺失的扫描根是否属于「已挂载存储卷上被删空的子目录」（排除整张 SD 卡卸载后挂载点消失但 /storage 仍可列的情形）
    private fun isMissingSubdirOnMountedVolume(file: File): Boolean =
        try {
            val parent = file.parentFile ?: return false
            Environment.getExternalStorageState(parent) == Environment.MEDIA_MOUNTED &&
                parent.listFiles() != null
        } catch (_: Exception) {
            false
        }

    // 排除：路径相等或以 "<excluded>/" 开头（段边界，避免 /Music 误命中 /MusicBackup）
    private fun isExcluded(path: String, excludedDirs: List<String>): Boolean =
        excludedDirs.any { path == it || path.startsWith("$it/") }

    // 是否位于某不可信子树下（相等或段边界前缀）：若路径同时落在某个更深且已成功枚举的显式 root 下
    // （如外层 /Android/data 不可列，但内层应用私有下载目录已正常枚举），以更具体的可读 root 为准
    private fun isUnderUntrusted(
        path: String,
        untrustedPrefixes: List<String>,
        trustedRoots: Set<String>,
    ): Boolean {
        val deepestUntrusted = untrustedPrefixes
            .filter { path == it || path.startsWith("$it/") }
            .maxOfOrNull { it.length } ?: return false
        val deepestTrustedRoot = trustedRoots
            .filter { path == it || path.startsWith("$it/") }
            .maxOfOrNull { it.length } ?: -1
        return deepestUntrusted >= deepestTrustedRoot
    }

    private fun fileToMap(
        c: Candidate,
        r: TagReadResult,
        durationMs: Long,
        legacyTagCharset: String,
    ): WritableMap {
        // 只有 ID3 那一族会出这种乱码；其余容器（FLAC/Ogg 的 Vorbis comment、M4A 的 iTunes
        // metadata）规范即 UTF-8，不可能声明成 ISO-8859-1。**不加这道闸门就会误伤它们**：
        // 一个正确编码的 FLAC 标签若含 `ÄäÖö`，解出来同样全是 ≤U+00FF 的字符，
        // 同样会过形状判据、被按 GBK 解成错字
        val charset = if (c.extension == "mp3") legacyTagCharset else ""
        val artist = text(r, "ARTIST", charset)
        return Arguments.createMap().apply {
            putString("id", md5(c.path))
            putString("path", c.path)
            putString(
                "title",
                text(r, "TITLE", charset)
                    .ifEmpty { c.file.nameWithoutExtension },
            )
            putString("artist", artist)
            putString("album", text(r, "ALBUM", charset))
            putString(
                "albumArtist",
                text(r, "ALBUMARTIST", charset).ifEmpty { artist },
            )
            putDouble("durationMs", durationMs.toDouble())
            putDouble("sizeBytes", c.sizeBytes.toDouble())
            putDouble("mtimeMs", c.mtimeMs.toDouble())
            putString("folderPath", c.folderPath)
            putString("extension", c.extension)
            // 本 App 下载写入的自描述快照（无则空串）；TagLib 已把全部字段读进 PropertyMap，多取一键无额外开销
            putString("mfMusicItem", field(r, "MF_MUSICITEM"))
            putBoolean("hasCoverArt", r.hasCoverArt)
        }
    }

    private fun field(r: TagReadResult, key: String): String =
        r.fields[key]?.firstOrNull().orEmpty()

    /**
     * 面向用户的文本字段：取值后再过一道旧标签乱码修复
     *
     * **只给展示用的文本字段用**（title / artist / album / albumArtist）。
     * MF_MUSICITEM 必须继续走未修复的 field()——那是本 App 下载时自己写的 UTF-8 JSON
     * 快照，它承载媒体身份，一旦被误修就认不出那首歌是哪个插件的了
     */
    private fun text(r: TagReadResult, key: String, legacyTagCharset: String): String =
        LegacyTagText.repair(field(r, key), legacyTagCharset)

    private fun emitProgress(
        scanId: Int,
        batch: WritableArray,
        processed: Int,
        total: Int,
        currentPath: String,
    ) {
        val m = Arguments.createMap().apply {
            putDouble("scanId", scanId.toDouble())
            putArray("batch", batch)
            putDouble("processed", processed.toDouble())
            putDouble("total", total.toDouble())
            putString("currentPath", currentPath)
        }
        mainHandler.post { if (canEmit(scanId)) emitOnScanProgress(m) }
    }

    private fun emitComplete(
        scanId: Int,
        removedPaths: WritableArray,
        failedPaths: WritableArray,
        tagsRead: Int,
        reused: Int,
    ) {
        val m = Arguments.createMap().apply {
            putDouble("scanId", scanId.toDouble())
            putArray("removedPaths", removedPaths)
            putArray("failedPaths", failedPaths)
            putDouble("tagsRead", tagsRead.toDouble())
            putDouble("reused", reused.toDouble())
        }
        mainHandler.post { if (canEmit(scanId)) emitOnScanComplete(m) }
    }

    private fun emitError(scanId: Int, code: String, message: String) {
        val m = Arguments.createMap().apply {
            putDouble("scanId", scanId.toDouble())
            putString("code", code)
            putString("message", message)
        }
        mainHandler.post { if (canEmit(scanId)) emitOnScanError(m) }
    }

    // 仍是活跃代次且未销毁才发（拦主线程投递期间发生的取消/覆盖/销毁）
    private fun canEmit(scanId: Int): Boolean = !destroyed && isActive(scanId)

    private fun isActive(scanId: Int): Boolean = activeScanId.get() == scanId

    private fun md5(s: String): String {
        val bytes = MessageDigest.getInstance("MD5").digest(s.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }

    private fun File.canonicalPathOrNull(): String? =
        try {
            canonicalPath
        } catch (_: Exception) {
            null
        }

    private fun parseFingerprints(json: String?): Map<String, String> {
        if (json.isNullOrEmpty()) return emptyMap()
        return try {
            val obj = JSONObject(json)
            val map = HashMap<String, String>(obj.length())
            val keys = obj.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                map[k] = obj.getString(k)
            }
            map
        } catch (_: Exception) {
            emptyMap()
        }
    }

    private fun ReadableArray?.toStringList(): List<String> {
        if (this == null) return emptyList()
        return (0 until size()).mapNotNull { getString(it) }
    }

    companion object {
        /** 目录里有这个文件就整棵按非媒体跳过（Android 媒体库同一约定） */
        private const val NOMEDIA_MARKER = ".nomedia"

        const val NAME = "NativeMediaScanner"

        // 单批经进度事件回传的最多文件数上限（防单次跨桥载荷过大）
        private const val MAX_BATCH = 500
    }
}
