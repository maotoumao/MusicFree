package `fun`.upup.musicfree.floatingLyric

import android.annotation.SuppressLint
import android.content.ComponentCallbacks
import android.content.Context
import android.content.res.Configuration
import android.graphics.PixelFormat
import android.hardware.input.InputManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.Toast
import kotlin.math.roundToInt

/** 浮层内的文案（可见标签 + 读屏标签）；原生零文案，全部由 JS 的 i18n 下发 */
data class FloatingLyricLabels(
    val openApp: String,
    val close: String,
    val lock: String,
    val settings: String,
    val play: String,
    val pause: String,
    val previous: String,
    val next: String,
    val textColor: String,
    val fontSize: String,
    val fontSmaller: String,
    val fontLarger: String,
    val lockedHint: String,
)

/** 浮层渲染配置（原生侧解析结果；跨线程安全的普通对象，非 ReadableMap） */
data class FloatingLyricConfig(
    /** 呈现形态：决定挂哪个内容视图 */
    val mode: FloatingLyricMode,
    val fontSize: Int,
    val fontSizeSteps: List<Int>,
    val textColor: String,
    val textColorOptions: List<String>,
    val backgroundOpacity: Double,
    val showTranslation: Boolean,
    val locked: Boolean,
    /** 归一化纵向锚点 0–1，按安全区内的可移动范围 */
    val positionY: Float,
    val labels: FloatingLyricLabels,
)

/**
 * 可用区域：位置换算的唯一基准，坐标系必须与窗口 flag 对齐（见 applyCoordinateFlags）
 * API 30+ 关掉系统自动避让、自己按 maximumWindowMetrics − insets 算（原点是屏幕绝对坐标）
 * 低版本拿不到 WindowMetrics，用整块 displayMetrics 且不扣 inset：桌面卡交给系统避让，
 * 状态栏条则靠 LAYOUT_IN_SCREEN 换到屏幕坐标系自己压到顶
 */
private data class SafeArea(val left: Int, val top: Int, val width: Int, val height: Int)

/** 已下发给 WindowManager 的窗口参数快照；WindowManager 持有副本，改了不下发不生效 */
private data class PushedParams(
    val x: Int,
    val y: Int,
    val width: Int,
    val flags: Int,
    val alpha: Float,
)

/**
 * 悬浮歌词浮层：WindowManager 承载的 TYPE_APPLICATION_OVERLAY 窗口（零业务）
 * 负责窗口 add/remove、纵向拖动、归一化锚点↔像素换算、锁定穿透；交互事件经回调交 Module emit
 * 卡片近全宽（横屏有最大宽度）且横向恒居中，位置只剩纵轴；归一化只认收起抽屉后的基准高度
 */
@SuppressLint("ClickableViewAccessibility")
class FloatingLyricWindow(
    private val context: Context,
    private val onPositionChange: (y: Float) -> Unit,
    private val onRequestLock: () -> Unit,
    private val onRequestClose: () -> Unit,
    private val onRequestOpenApp: () -> Unit,
    private val onRequestOpenSettings: () -> Unit,
    private val onRequestPlayToggle: () -> Unit,
    private val onRequestSkipToNext: () -> Unit,
    private val onRequestSkipToPrevious: () -> Unit,
    private val onTextColorChange: (hex: String) -> Unit,
    private val onFontSizeChange: (sp: Int) -> Unit,
) : ComponentCallbacks {
    private val windowManager =
        context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val handler = Handler(Looper.getMainLooper())

    // 显式标注类型：匿名对象内部引用了后声明的 content，靠推断会成环
    private val callbacks: FloatingLyricCardView.Callbacks =
        object : FloatingLyricCardView.Callbacks {
            override fun onDragStart() {
                dragging = true
                dragStartY = layoutParams.y
                refreshSafeArea()
                content.setDragVisual(true)
            }

            override fun onDragBy(dyPx: Int) {
                placeCard(dragStartY + dyPx)
            }

            override fun onDragEnd() {
                dragging = false
                content.setDragVisual(false)
                emitPosition()
            }

            override fun onDragCancel() {
                // 取消不写回锚点；回弹到期望位，避免停在未持久化的位置
                dragging = false
                content.setDragVisual(false)
                positionToDesired()
            }

            override fun onOpenApp() = onRequestOpenApp()
            override fun onClose() = onRequestClose()

            override fun onLock() {
                if (!lockHintShown && lockedHint.isNotEmpty()) {
                    lockHintShown = true
                    Toast.makeText(context, lockedHint, Toast.LENGTH_SHORT).show()
                }
                onRequestLock()
            }

            override fun onPlayToggle() = onRequestPlayToggle()
            override fun onSkipToNext() = onRequestSkipToNext()
            override fun onSkipToPrevious() = onRequestSkipToPrevious()
            override fun onOpenSettings() = onRequestOpenSettings()
            override fun onPickTextColor(hex: String) = onTextColorChange(hex)
            override fun onPickFontSize(sp: Int) = onFontSizeChange(sp)
        }

    /**
     * 挂进 WindowManager 的稳定容器：形态切换只换它的 child，窗口本身不摘不挂。
     * 若把内容视图直接作 root，切形态就得 remove/add 整个 overlay——期间可能两窗并存
     * （Android 12+ 两层 0.8 alpha 会合成 0.96、超过穿透阈值），addView 失败还会让浮层彻底消失
     */
    private val host = FrameLayout(context)

    /** 当前形态的内容视图；模式变化时换掉 host 的 child */
    private var content: FloatingLyricContent = createContent(FloatingLyricMode.Desktop)
    private var contentMode = FloatingLyricMode.Desktop

    /** 最后一次下发的歌词与播放态：换形态时新视图要靠它补齐，否则会空到下次歌词变化 */
    private var lastOriginal = ""
    private var lastTranslation: String? = null
    private var lastPlaying = false

    private fun createContent(mode: FloatingLyricMode): FloatingLyricContent =
        when (mode) {
            FloatingLyricMode.StatusBar -> FloatingLyricBarView(context)
            FloatingLyricMode.Desktop -> FloatingLyricCardView(context, callbacks)
        }

    private val layoutParams = WindowManager.LayoutParams(
        WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.WRAP_CONTENT,
        overlayType(),
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
        PixelFormat.TRANSLUCENT,
    ).apply {
        gravity = Gravity.TOP or Gravity.START
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // 关掉系统自动避让，改由 safeArea() 统一换算，避免系统栏被扣两遍
            fitInsetsTypes = 0
        }
    }

    private var added = false
    private var dragging = false
    private var dragStartY = 0
    /** 期望归一化锚点；尺寸变化（改字号 / 旋转）后据此重定位 */
    private var desiredY = DEFAULT_POSITION_Y
    /** 每次 show 起算一次：首次锁定给一条提示，告诉用户去哪解锁 */
    private var lockHintShown = false
    /** 首次锁定提示文案；随 config 下发，原生不持有 */
    private var lockedHint = ""
    /** 安全区快照：拖动热路径不再每帧问系统要 insets */
    private var safeAreaCache: SafeArea? = null
    /** 上次真正下发给 WindowManager 的参数，用于跳过空更新 */
    private var pushed = PushedParams(Int.MIN_VALUE, Int.MIN_VALUE, -1, 0, -1f)

    private val repositionRunnable = Runnable {
        if (added && !dragging) {
            positionToDesired()
        }
    }

    // 尺寸变化（首次测量 / 改字号 / 抽屉显隐）后据期望锚点重定位，避免用旧高度 clamp
    private val layoutListener =
        View.OnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
            handler.removeCallbacks(repositionRunnable)
            handler.post(repositionRunnable)
        }

    init {
        host.addView(
            content.view,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
            ),
        )
        host.addOnLayoutChangeListener(layoutListener)
        context.registerComponentCallbacks(this)
    }

    fun show(config: FloatingLyricConfig) {
        lockHintShown = false
        lockedHint = config.labels.lockedHint
        switchContentIfNeeded(config.mode)
        refreshSafeArea()
        content.applyStyle(config)
        applyLocked(config.locked)
        desiredY = config.positionY
        if (!added) {
            // 首次挂载前预定宽度并测量，使定位拿到内容高度、避免首帧按 0 闪跳
            applyWidth()
            measureContent()
        }
        positionToDesired()
        if (!added) {
            windowManager.addView(host, layoutParams)
            added = true
            recordPushed()
        }
    }

    /** 收起窗口并复位一次性状态；移除失败不吞、交调用方处理 */
    fun hide() {
        dragging = false
        content.resetTransientState()
        lastOriginal = ""
        lastTranslation = null
        lastPlaying = false
        if (added) {
            added = false
            windowManager.removeView(host)
        }
    }

    /** 销毁（幂等）：清 Handler 任务 + 布局/配置监听 + 移除窗口；Module invalidate 时调 */
    fun dispose() {
        handler.removeCallbacks(repositionRunnable)
        host.removeOnLayoutChangeListener(layoutListener)
        content.dispose()
        context.unregisterComponentCallbacks(this)
        runCatching { hide() }
    }

    fun update(config: FloatingLyricConfig) {
        lockedHint = config.labels.lockedHint
        switchContentIfNeeded(config.mode)
        content.applyStyle(config)
        applyLocked(config.locked)
        desiredY = config.positionY
        // 拖动中不重定位：否则会先跳回旧锚点，下一帧又按旧起点算，产生跳变
        if (added && !dragging) {
            positionToDesired()
        }
    }

    /**
     * 形态变化时换掉 host 的 child；窗口自身不动，故没有重挂失败与两窗并存的问题。
     * 新视图要补齐歌词与播放态——它们不随 config 下发，等下次事件会空一段
     */
    private fun switchContentIfNeeded(mode: FloatingLyricMode) {
        if (mode == contentMode) {
            return
        }
        dragging = false
        host.removeAllViews()
        content.dispose()
        contentMode = mode
        content = createContent(mode)
        host.addView(
            content.view,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
            ),
        )
        content.setLine(lastOriginal, lastTranslation)
        content.setPlaying(lastPlaying)
        // 两形态的位置基准不同（整屏 vs 安全区），缓存必须重算
        refreshSafeArea()
    }

    fun setLine(original: String, translation: String?) {
        lastOriginal = original
        lastTranslation = translation
        content.setLine(original, translation)
    }

    fun setPlaying(playing: Boolean) {
        lastPlaying = playing
        content.setPlaying(playing)
    }

    /** 屏幕旋转 / 尺寸变化：重取安全区、重算宽度并据期望锚点重定位 */
    override fun onConfigurationChanged(newConfig: Configuration) {
        if (added) {
            handler.post {
                if (added && !dragging) {
                    refreshSafeArea()
                    positionToDesired()
                }
            }
        }
    }

    @Suppress("OVERRIDE_DEPRECATION")
    override fun onLowMemory() {}

    /** 穿透：纯展示形态恒穿透，可交互形态按锁定态切换 */
    private fun applyLocked(value: Boolean) {
        val passthrough = value || content.alwaysPassthrough
        if (passthrough && dragging) {
            // 外部锁定要先了结在途手势，避免拖动回调继续改位置
            dragging = false
            content.setDragVisual(false)
        }
        content.setLocked(value)
        layoutParams.flags = if (passthrough) {
            layoutParams.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
        } else {
            layoutParams.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()
        }
        applyCoordinateFlags()
        // Android 12+ 非可信 overlay 跨应用穿透需 window alpha ≤ 最大遮挡不透明度
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            layoutParams.alpha = if (passthrough) {
                val im = context.getSystemService(Context.INPUT_SERVICE) as InputManager
                im.maximumObscuringOpacityForTouch
            } else {
                1f
            }
        }
        // 拖动中不会走 placeCard，锁定的 flags 需要在这里自己下发
        syncWindow()
    }

    /**
     * 两个独立的窗口 flag，别再混为一谈：
     * - LAYOUT_IN_SCREEN 决定 `y` 的原点是屏幕左上角还是应用内容区左上角（即状态栏下沿），
     *   必须与 safeArea 的坐标系一致，否则 safe.top 会在系统已避让的基础上再叠一次
     * - LAYOUT_NO_LIMITS 决定窗口能否越出系统装饰区，只有要压进状态栏的形态需要
     *
     * API 30+ 的 safeArea 走 maximumWindowMetrics（原点即屏幕左上），故两种形态都要屏幕坐标系；
     * 低版本 safeArea 是不扣 inset 的 displayMetrics，交给系统避让反而正确，只有越界形态才换坐标系
     */
    private fun applyCoordinateFlags() {
        val screenCoordinates =
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.R || content.usesFullBounds
        layoutParams.flags = if (screenCoordinates) {
            layoutParams.flags or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
        } else {
            layoutParams.flags and WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN.inv()
        }
        layoutParams.flags = if (content.usesFullBounds) {
            layoutParams.flags or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
        } else {
            layoutParams.flags and WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS.inv()
        }
    }

    /** 宽度策略由内容视图定：卡片近全宽有上限，状态栏条占满可用宽以便文字居中 */
    private fun applyWidth() {
        layoutParams.width = content.windowWidth(safeArea().width)
    }

    /** 据期望归一化锚点算像素位并落位；归一化范围只认收起抽屉后的基准高度 */
    private fun positionToDesired() {
        applyWidth()
        val safe = safeArea()
        placeCard(safe.top + (desiredY * anchorRange(safe)).roundToInt())
    }

    /**
     * 把卡片放到目标纵向像素位，横向恒居中
     * clamp 用整卡实际高度：抽屉展开且贴底时整体上移，收起后按锚点回原位，锚点本身不变
     */
    private fun placeCard(y: Int) {
        val safe = safeArea()
        val maxTop = safe.top + (safe.height - fullHeight()).coerceAtLeast(0)
        layoutParams.x = safe.left + (safe.width - layoutParams.width) / 2
        layoutParams.y = y.coerceIn(safe.top, maxTop)
        syncWindow()
    }

    /**
     * 下发 layoutParams；与上次已下发的完全一致则跳过——布局回调很频繁，空更新会让窗口抖
     * 比较必须覆盖 flags / alpha / width：WindowManager 持有参数副本，改了不下发就不生效
     * （锁定只改 flags 不改位置，漏掉它会让锁定后照样挡住下层触摸）
     */
    private fun syncWindow() {
        if (!added) {
            return
        }
        if (
            pushed.x == layoutParams.x &&
            pushed.y == layoutParams.y &&
            pushed.width == layoutParams.width &&
            pushed.flags == layoutParams.flags &&
            pushed.alpha == layoutParams.alpha
        ) {
            return
        }
        windowManager.updateViewLayout(host, layoutParams)
        recordPushed()
    }

    private fun recordPushed() {
        pushed = PushedParams(
            layoutParams.x,
            layoutParams.y,
            layoutParams.width,
            layoutParams.flags,
            layoutParams.alpha,
        )
    }

    /** 当前像素位 → 归一化纵向锚点，存为期望值并回调持久化 */
    private fun emitPosition() {
        val safe = safeArea()
        val range = anchorRange(safe)
        val normalized = if (range > 0) {
            ((layoutParams.y - safe.top).toFloat() / range).coerceIn(0f, 1f)
        } else {
            0f
        }
        desiredY = normalized
        onPositionChange(normalized)
    }

    /** 锚点可移动范围：安全区高 − 内容的基准高（卡片取收起抽屉后的高度，使抽屉显隐不挪卡片） */
    private fun anchorRange(safe: SafeArea): Int =
        (safe.height - content.anchorHeight()).coerceAtLeast(0)

    private fun fullHeight(): Int =
        if (host.height > 0) host.height else host.measuredHeight

    /** 首次挂载前预测量，使定位能拿到内容高度、避免首帧按 0 定位闪跳 */
    private fun measureContent() {
        val safe = safeArea()
        host.measure(
            View.MeasureSpec.makeMeasureSpec(layoutParams.width, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(safe.height, View.MeasureSpec.AT_MOST),
        )
    }

    private fun safeArea(): SafeArea = safeAreaCache ?: computeSafeArea().also {
        safeAreaCache = it
    }

    private fun refreshSafeArea() {
        safeAreaCache = computeSafeArea()
    }

    /**
     * 用 maximumWindowMetrics 而非 currentWindowMetrics：后者是「当前窗口」的度量，
     * 部分 ROM / 版本上它的 bounds 已经扣掉了状态栏，再叠一次 insets.top 就成了双倍偏移；
     * 前者恒为整块 display（bounds.top = 0），其 insets 也正是「窗口占满全屏」时的值——
     * overlay 窗口就是这种情况
     */
    private fun computeSafeArea(): SafeArea {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val metrics = windowManager.maximumWindowMetrics
            val bounds = metrics.bounds
            // 状态栏条要能落到系统状态栏那一带，故整屏起算、不扣系统栏内距
            if (content.usesFullBounds) {
                return SafeArea(bounds.left, bounds.top, bounds.width(), bounds.height())
            }
            val insets = metrics.windowInsets.getInsetsIgnoringVisibility(
                WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout(),
            )
            return SafeArea(
                left = bounds.left + insets.left,
                top = bounds.top + insets.top,
                width = (bounds.width() - insets.left - insets.right).coerceAtLeast(0),
                height = (bounds.height() - insets.top - insets.bottom).coerceAtLeast(0),
            )
        }
        // 低版本没有 WindowMetrics，退回整屏 displayMetrics；坐标系差异见 applyCoordinateFlags
        val dm = context.resources.displayMetrics
        return SafeArea(0, 0, dm.widthPixels, dm.heightPixels)
    }

    private fun overlayType(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

    companion object {
        // 缺省纵向锚点：可移动范围的 18%（上半屏靠上）
        private const val DEFAULT_POSITION_Y = 0.18f
    }
}
