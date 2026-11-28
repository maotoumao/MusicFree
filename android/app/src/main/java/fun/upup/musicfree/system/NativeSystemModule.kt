package `fun`.upup.musicfree.system

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.PowerManager
import android.os.storage.StorageManager
import android.os.storage.StorageVolume
import android.provider.Settings
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.module.annotations.ReactModule
import `fun`.upup.musicfree.specs.NativeSystemSpec
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import kotlin.system.exitProcess

/**
 * OS 系统集成桥：进程硬退出、电池优化白名单、全文件访问、存储卷枚举、沉浸式系统栏
 * NativeSystemSpec 由 codegen 生成（共用 codegenConfig，javaPackageName=...audio），首次 build 后才存在
 */
@ReactModule(name = NativeSystemModule.NAME)
class NativeSystemModule(private val reactContext: ReactApplicationContext) :
    NativeSystemSpec(reactContext), LifecycleEventListener {

    // 单线程够用：卷枚举是低频调用（扫描开始 / 打开目录浏览器 / 进扫描范围页）
    private val ioExecutor = Executors.newSingleThreadExecutor()

    /**
     * 当前是否处于沉浸请求态。API < 30 的 compat 实现落在 systemUiVisibility 老路，那套标志在窗口失焦
     * （切到别的 app、锁屏）时会被系统清掉，回前台要按请求态重新施加；API 30+ 的显隐状态本身持久，重施加是空操作
     */
    @Volatile
    private var immersiveRequested = false

    init {
        reactContext.addLifecycleEventListener(this)
    }

    // 实例已销毁：已入队的请求据此立刻结算，不留悬着的 Promise
    @Volatile
    private var destroyed = false

    override fun invalidate() {
        destroyed = true
        // 用 shutdown 而非 shutdownNow：后者会把已入队、还没跑的任务直接丢掉，
        // 那些请求的 Promise 就永远不会 resolve 也不会 reject。放它们跑到、
        // 看见 destroyed 立刻 reject 即可（枚举本身很短，不值得强行打断）
        ioExecutor.shutdown()
        reactContext.removeLifecycleEventListener(this)
        super.invalidate()
    }

    override fun onHostResume() {
        if (immersiveRequested) applyImmersiveSystemBars(true)
    }

    override fun onHostPause() = Unit

    override fun onHostDestroy() = Unit

    override fun exitApp() {
        reactContext.currentActivity?.finishAndRemoveTask()
        android.os.Process.killProcess(android.os.Process.myPid())
        exitProcess(0)
    }

    override fun isIgnoringBatteryOptimizations(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            promise.resolve(pm.isIgnoringBatteryOptimizations(reactContext.packageName))
        } else {
            promise.resolve(true)
        }
    }

    override fun requestIgnoreBatteryOptimizations(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            promise.resolve(null)
            return
        }
        val pkg = Uri.parse("package:${reactContext.packageName}")
        val intents = listOf(
            Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkg),
            Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
        )
        if (startFirstAvailable(intents)) {
            promise.resolve(null)
        } else {
            promise.reject("E_BATTERY", "no battery optimization settings activity")
        }
    }

    override fun isAllFilesAccessGranted(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            promise.resolve(Environment.isExternalStorageManager())
        } else {
            val read = ContextCompat.checkSelfPermission(
                reactContext, Manifest.permission.READ_EXTERNAL_STORAGE,
            ) == PackageManager.PERMISSION_GRANTED
            val write = ContextCompat.checkSelfPermission(
                reactContext, Manifest.permission.WRITE_EXTERNAL_STORAGE,
            ) == PackageManager.PERMISSION_GRANTED
            promise.resolve(read && write)
        }
    }

    override fun requestAllFilesAccess(promise: Promise) {
        val pkg = Uri.parse("package:${reactContext.packageName}")
        val intents = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // 直达本应用 → 全局全文件访问列表 → 应用详情（兜底缺对应设置页的 ROM）
            listOf(
                Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, pkg),
                Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION),
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg),
            )
        } else {
            listOf(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg))
        }
        if (startFirstAvailable(intents)) {
            promise.resolve(null)
        } else {
            promise.reject("E_ALL_FILES_ACCESS", "no settings activity")
        }
    }

    override fun getStorageVolumes(promise: Promise) {
        // 枚举要碰磁盘（R 以前经 getExternalFilesDirs，会 mkdirs 私有目录）且逐卷 stat，
        // 而 TurboModule 的 Promise 方法跑在 JS 线程上——挪到后台线程，别让它卡住一帧
        try {
            ioExecutor.execute { resolveStorageVolumes(promise) }
        } catch (_: RejectedExecutionException) {
            // 模块已销毁后仍有在途调用：明确失败，别把 Promise 永远悬着
            promise.reject("E_STORAGE_VOLUMES", "module destroyed")
        }
    }

    private fun resolveStorageVolumes(promise: Promise) {
        if (destroyed) {
            promise.reject("E_STORAGE_VOLUMES", "module destroyed")
            return
        }
        try {
            val out = Arguments.createArray()
            val seen = HashSet<String>()
            for ((dir, volume, mountedByOrigin) in volumeDirectories()) {
                val path = dir.absolutePath
                // 同一卷可能从两条途径各报一次（如 files 目录别名）：按根路径去重
                if (!seen.add(path)) continue
                // isPrimary 拿不到 StorageVolume 时按「是否等于主共享存储根」推断
                val primary = volume?.isPrimary
                    ?: (path == Environment.getExternalStorageDirectory()?.absolutePath)
                out.pushMap(
                    Arguments.createMap().apply {
                        putString("path", path)
                        putString("name", volume?.getDescription(reactContext).orEmpty())
                        putBoolean("isPrimary", primary)
                        putBoolean("isRemovable", volume?.isRemovable ?: !primary)
                        // 挂载态优先问卷自己（getState 与同批的 getDescription/isPrimary/
                        // isRemovable 一样是 API 24，本模块 pre-R 分支已在用那几个）；
                        // 只读挂载（写保护的卡）同样算已挂载——扫描只读
                        val state = volume?.state
                            ?: Environment.getExternalStorageState(dir)
                        putBoolean(
                            "isMounted",
                            state == Environment.MEDIA_MOUNTED ||
                                state == Environment.MEDIA_MOUNTED_READ_ONLY ||
                                // state 说不清时（部分 ROM / OTG 卷会回 MEDIA_UNKNOWN）按来路判：
                                // 卷根本就是从 app 私有目录反推来的，拿得到那个目录即已挂载。
                                // 否则一张活着的卡会被静默丢出扫描范围（正是本轮要修的原 bug）
                                (mountedByOrigin && state == Environment.MEDIA_UNKNOWN),
                        )
                    },
                )
            }
            promise.resolve(out)
        } catch (e: Exception) {
            promise.reject("E_STORAGE_VOLUMES", e.message ?: "cannot enumerate storage volumes")
        }
    }

    /**
     * 一个卷的根目录 + 其 StorageVolume（取不到则 null）+ 来路本身是否已证明它已挂载
     * `mountedByOrigin` 只对「从 app 私有目录反推」的来路为真：拿得到那个目录就说明卷已挂载
     */
    private data class VolumeRoot(
        val dir: File,
        val volume: StorageVolume?,
        val mountedByOrigin: Boolean,
    )

    /**
     * 各存储卷的根目录
     * R+ 直接问 `StorageVolume.getDirectory()`（未挂载的卷返回 null，自然被过滤）；
     * R 以前无该 API，改从本应用私有目录 `<卷根>/Android/data/<pkg>/files` 反推卷根
     * —— 每个可用卷各一个、免权限，是该版本区间唯一可靠的卷根来源
     */
    private fun volumeDirectories(): List<VolumeRoot> {
        val sm = reactContext.getSystemService(Context.STORAGE_SERVICE) as? StorageManager
            ?: return emptyList()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return sm.storageVolumes.mapNotNull { v ->
                v.directory?.let { VolumeRoot(it, v, mountedByOrigin = false) }
            }
        }
        return ContextCompat.getExternalFilesDirs(reactContext, null)
            .filterNotNull()
            .mapNotNull { filesDir ->
                val root = volumeRootOf(filesDir) ?: return@mapNotNull null
                // getStorageVolume 偶有 IllegalArgumentException（路径不属任何已知卷）：降级为无卷信息
                val volume = runCatching { sm.getStorageVolume(filesDir) }.getOrNull()
                VolumeRoot(root, volume, mountedByOrigin = true)
            }
    }

    /** 从 `<卷根>/Android/data/<pkg>/files` 截出卷根；不含该段（非预期布局）则弃用该项 */
    private fun volumeRootOf(filesDir: File): File? {
        val path = filesDir.absolutePath
        val i = path.indexOf(ANDROID_DATA_SEGMENT)
        return if (i > 0) File(path.substring(0, i)) else null
    }

    override fun canDrawOverlays(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            promise.resolve(Settings.canDrawOverlays(reactContext))
        } else {
            promise.resolve(true)
        }
    }

    override fun openOverlaySettings(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            promise.resolve(null)
            return
        }
        val pkg = Uri.parse("package:${reactContext.packageName}")
        val intents = listOf(
            // 尽量定位本应用（R 以前可直达；R+ 通常打开全局 overlay 列表）→ 应用详情兜底
            Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkg),
            Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION),
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg),
        )
        if (startFirstAvailable(intents)) {
            promise.resolve(null)
        } else {
            promise.reject("E_OVERLAY", "no overlay settings activity")
        }
    }

    /**
     * 沉浸式系统栏：藏掉状态栏与导航栏（两栏的 inset 随之归零）；用户从边缘滑出的栏只作临时覆盖、
     * 几秒后自动收回，**那一次**不派发 WindowInsets（内容不位移）——视频播放器那种全屏。
     * 多窗口下系统会忽略 hide，退化为无操作
     * 不碰 decorFitsSystemWindows：全 App 本就 edge-to-edge（gradle.properties edgeToEdgeEnabled），
     * 这里只改显隐与行为，恢复时对称 show 回来，不留后遗症
     */
    override fun setImmersiveSystemBars(enabled: Boolean) {
        immersiveRequested = enabled
        applyImmersiveSystemBars(enabled)
    }

    private fun applyImmersiveSystemBars(enabled: Boolean) {
        UiThreadUtil.runOnUiThread {
            // 在真正执行的那一刻才取 Activity：JS 线程上先取再捕进闭包，会让进 / 出两次判空落在不同时刻
            val window = reactContext.currentActivity?.window ?: return@runOnUiThread
            val controller = WindowCompat.getInsetsController(window, window.decorView)
            if (enabled) {
                controller.systemBarsBehavior =
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                controller.hide(WindowInsetsCompat.Type.systemBars())
            } else {
                controller.show(WindowInsetsCompat.Type.systemBars())
                controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_DEFAULT
            }
        }
    }

    /** 依次尝试各兜底 Intent，起成第一个可用的；有 Activity 直接起，否则 app context + NEW_TASK */
    private fun startFirstAvailable(intents: List<Intent>): Boolean {
        val activity = reactContext.currentActivity
        for (intent in intents) {
            try {
                if (activity != null) {
                    activity.startActivity(intent)
                } else {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    reactContext.startActivity(intent)
                }
                return true
            } catch (e: ActivityNotFoundException) {
                // 试下一个兜底入口
            }
        }
        return false
    }

    companion object {
        const val NAME = "NativeSystem"

        /** app 私有外部目录里的固定段，用于反推卷根（R 以前的卷枚举路径） */
        private const val ANDROID_DATA_SEGMENT = "/Android/data/"
    }
}
