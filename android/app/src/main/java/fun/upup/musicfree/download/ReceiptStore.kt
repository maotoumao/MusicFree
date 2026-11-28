package `fun`.upup.musicfree.download

import android.content.Context
import java.io.File
import org.json.JSONObject

/**
 * 完成回执持久化：下载完成在 emit onComplete 之前先落盘一份回执，JS 入账后 ackCompletion 清除。
 * 进程在「emit 之后、JS 入账之前」被杀时回执留存，App 重启经 getUnackedCompletions 重放，实现 at-least-once + JS 幂等入账。
 * 每个回执一个 JSON 文件（按 taskId 命名，独立写 / 删、无需整表锁）；taskId 由 module 侧 isSafeName 保证可安全作文件名。
 */
class ReceiptStore(context: Context) {
    private val dir = File(context.filesDir, DIR_NAME).apply { mkdirs() }

    /** 完成回执快照；字段与 onComplete 对齐，重放不丢信息 */
    data class Receipt(
        val taskId: String,
        val contentKey: String,
        val path: String,
        val extension: String,
        val sizeBytes: Long,
        val taggedOk: Boolean,
    )

    /** 写入回执（覆盖同 taskId）；先写临时文件再原子 rename，避免中途被杀留下半截 JSON。失败尽力吞掉——回执是补偿，绝不阻塞已发布的文件与 onComplete */
    fun write(receipt: Receipt) {
        val file = fileFor(receipt.taskId) ?: return
        try {
            val json = JSONObject().apply {
                put("taskId", receipt.taskId)
                put("contentKey", receipt.contentKey)
                put("path", receipt.path)
                put("extension", receipt.extension)
                put("sizeBytes", receipt.sizeBytes)
                put("taggedOk", receipt.taggedOk)
            }
            val tmp = File(dir, receipt.taskId + TMP_SUFFIX)
            tmp.writeText(json.toString())
            if (!tmp.renameTo(file)) tmp.delete() // rename 失败则清理临时文件，不留残缺
        } catch (_: Throwable) {
            // 写入失败仅失去补偿能力，不影响完成本身
        }
    }

    /** 列出所有未入账回执；跳过临时文件与解析失败项（不因一条坏数据拖垮重放） */
    fun list(): List<Receipt> =
        dir.listFiles()?.mapNotNull { file ->
            if (file.name.endsWith(TMP_SUFFIX)) return@mapNotNull null
            try {
                val json = JSONObject(file.readText())
                Receipt(
                    taskId = json.getString("taskId"),
                    contentKey = json.getString("contentKey"),
                    path = json.getString("path"),
                    extension = json.getString("extension"),
                    sizeBytes = json.getLong("sizeBytes"),
                    taggedOk = json.getBoolean("taggedOk"),
                )
            } catch (_: Throwable) {
                null
            }
        } ?: emptyList()

    /** 删除已入账回执；非法名或删除失败均无害——下次仍会重放，JS 入账幂等 */
    fun remove(taskId: String) {
        val file = fileFor(taskId) ?: return
        try {
            file.delete()
        } catch (_: Throwable) {
            // 删除失败下次重放由 JS 幂等吸收
        }
    }

    /**
     * 把 taskId 解析成回执目录下的单段文件；非法名（空 / 相对段 / 含路径分隔符 / 临时后缀 / 超文件名字节上限）返回 null，调用方 no-op。
     * 文件边界的纵深防御：module 侧已对 taskId 做 isSafeName，此处再挡一层，杜绝 ackCompletion 等入口的路径穿越删除。
     */
    private fun fileFor(taskId: String): File? {
        if (taskId.isEmpty() || taskId == "." || taskId == "..") return null
        if (taskId.endsWith(TMP_SUFFIX)) return null
        if (taskId.any { it == '/' || it == '\\' || it == '\u0000' }) return null
        if (taskId.toByteArray(Charsets.UTF_8).size > MAX_NAME_BYTES) return null
        return File(dir, taskId)
    }

    private companion object {
        const val DIR_NAME = "download-receipts"
        const val TMP_SUFFIX = ".tmp"
        const val MAX_NAME_BYTES = 255
    }
}
