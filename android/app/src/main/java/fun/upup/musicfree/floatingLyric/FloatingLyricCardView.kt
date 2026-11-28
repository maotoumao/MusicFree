package `fun`.upup.musicfree.floatingLyric

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.accessibility.AccessibilityManager
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import `fun`.upup.musicfree.R
import kotlin.math.abs
import kotlin.math.roundToInt

/** dp → 像素与 CSS 颜色换算见 FloatingLyricContent.kt（两个形态共用） */

/**
 * 桌面歌词卡：头部（应用标记 + 关闭）+ 恒 2 行歌词区 + 控制行 + 可展开的设置抽屉
 * 歌词的屏幕位置是不变量：锁定与静置都只改绘制、不动布局；抽屉只向下生长
 * 手势：整卡任意处按下、位移越过 touchSlop 即接管为纵向拖动，子控件收到取消
 * 字号用 dp 而非 sp——App 受控字号，浮层字号由用户在档位里选，不再叠系统字体缩放
 */
@SuppressLint("ViewConstructor")
class FloatingLyricCardView(
    context: Context,
    private val callbacks: Callbacks,
) : LinearLayout(context), FloatingLyricContent {

    override val view: View get() = this

    /** 可交互形态：是否穿透由锁定态决定 */
    override val alwaysPassthrough: Boolean = false

    /** 可交互形态避开系统栏：盖住状态栏会挡住时间电量，也会干扰下拉通知 */
    override val usesFullBounds: Boolean = false

    /** 卡片交互回调；窗口实现之，位置策略与事件转发都在窗口侧 */
    interface Callbacks {
        fun onDragStart()
        fun onDragBy(dyPx: Int)
        fun onDragEnd()
        fun onDragCancel()
        fun onOpenApp()
        fun onClose()
        fun onLock()
        fun onPlayToggle()
        fun onSkipToNext()
        fun onSkipToPrevious()
        fun onOpenSettings()
        fun onPickTextColor(hex: String)
        fun onPickFontSize(sp: Int)
    }

    private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
    private val handler = Handler(Looper.getMainLooper())

    private val surface = GradientDrawable().apply {
        cornerRadius = context.dpToPx(RADIUS_DP)
    }

    private val header = LinearLayout(context).apply {
        orientation = HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
    }
    private val logoButton =
        iconButton(R.mipmap.ic_launcher_foreground) {
            callbacks.onOpenApp()
        }.apply {
            // 用自适应图标的前景层（透明底白色剪影），不带方块底；它自带约 1/3 安全区留白，故内距收窄
            val pad = context.dpToPxInt(LOGO_PADDING_DP)
            setPadding(pad, pad, pad, pad)
        }
    private val closeButton =
        iconButton(R.drawable.ic_floating_lyric_close) { callbacks.onClose() }

    private val lyricBox = LinearLayout(context).apply {
        orientation = VERTICAL
        gravity = Gravity.CENTER
    }
    private val originalView = TextView(context)
    private val translationView = TextView(context)

    private val controls = LinearLayout(context).apply {
        orientation = HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
    }
    private val lockButton =
        iconButton(R.drawable.ic_floating_lyric_lock) { callbacks.onLock() }
    private val previousButton =
        iconButton(R.drawable.ic_floating_lyric_previous) {
            callbacks.onSkipToPrevious()
        }
    private val playButton =
        iconButton(R.drawable.ic_floating_lyric_play) { callbacks.onPlayToggle() }
    private val nextButton =
        iconButton(R.drawable.ic_floating_lyric_next) { callbacks.onSkipToNext() }
    private val settingsButton =
        iconButton(R.drawable.ic_floating_lyric_settings) { toggleDrawer() }

    private val drawer = LinearLayout(context).apply {
        orientation = VERTICAL
        visibility = View.GONE
    }
    private val colorRail = ColorRailView(context)
    private val colorLabel = drawerLabel()
    private val fontLabel = drawerLabel()
    private val fontDots = StepDotsView(context)
    private val fontValue = TextView(context)
    private val minusButton =
        iconButton(R.drawable.ic_floating_lyric_minus) { stepFont(-1) }
    private val plusButton =
        iconButton(R.drawable.ic_floating_lyric_plus) { stepFont(1) }

    private var fontSizeDp = 18f
    private var fontSizeSteps: List<Int> = listOf(18)
    private var textColorOptions: List<String> = emptyList()
    private var backgroundOpacity = 0.32
    private var showTranslation = false
    private var currentTranslation: String? = null
    private var locked = false
    private var idle = false
    private var playing = false
    private var labels: FloatingLyricLabels? = null
    private var dragging = false
    /** 0=完全活跃 1=完全退隐（静置或锁定）；底色、描边、chrome 都由它插值 */
    private var inactiveness = 0f
    private var inactiveAnimator: ValueAnimator? = null

    private var downY = 0f
    private var downX = 0f
    private var dragMoved = false

    private val idleRunnable = Runnable { setIdle(true) }

    init {
        orientation = VERTICAL
        background = surface
        setPadding(
            context.dpToPxInt(PADDING_H_DP),
            context.dpToPxInt(PADDING_TOP_DP),
            context.dpToPxInt(PADDING_H_DP),
            context.dpToPxInt(PADDING_BOTTOM_DP),
        )
        buildHeader()
        buildLyricBox()
        buildControls()
        buildDrawer()
        renderSurface()
    }

    // —— 装配 ——

    private fun buildHeader() {
        val hit = context.dpToPxInt(HIT_DP)
        header.addView(logoButton, LayoutParams(hit, hit))
        header.addView(View(context), LayoutParams(0, LayoutParams.MATCH_PARENT, 1f))
        header.addView(closeButton, LayoutParams(hit, hit))
        // 负边距让 44dp 命中区压进卡片内距，图标视觉仍贴近卡片边缘
        addView(
            header,
            LayoutParams(LayoutParams.MATCH_PARENT, hit).apply {
                marginStart = -context.dpToPxInt(HIT_INSET_DP)
                marginEnd = -context.dpToPxInt(HIT_INSET_DP)
            },
        )
    }

    private fun buildLyricBox() {
        for (view in arrayOf(originalView, translationView)) {
            view.gravity = Gravity.CENTER_HORIZONTAL
            view.ellipsize = TextUtils.TruncateAt.END
            view.includeFontPadding = false
        }
        originalView.text = ""
        translationView.maxLines = 1
        translationView.visibility = View.GONE
        lyricBox.addView(
            originalView,
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT),
        )
        lyricBox.addView(
            translationView,
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT),
        )
        addView(lyricBox, LayoutParams(LayoutParams.MATCH_PARENT, 0))
    }

    private fun buildControls() {
        val hit = context.dpToPxInt(HIT_DP)
        val gap = context.dpToPxInt(TRANSPORT_GAP_DP)
        controls.addView(lockButton, LayoutParams(hit, hit))
        controls.addView(View(context), LayoutParams(0, 1, 1f))
        controls.addView(previousButton, LayoutParams(hit, hit))
        controls.addView(
            playButton,
            LayoutParams(hit, hit).apply {
                marginStart = gap
                marginEnd = gap
            },
        )
        controls.addView(nextButton, LayoutParams(hit, hit))
        controls.addView(View(context), LayoutParams(0, 1, 1f))
        controls.addView(settingsButton, LayoutParams(hit, hit))
        // 播放键是全卡唯一实心元素：白 16% 圆底，用形状而非颜色做强调
        playButton.background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(Color.argb(41, 255, 255, 255))
        }
        lockButton.alpha = MODE_KEY_ALPHA
        settingsButton.alpha = MODE_KEY_ALPHA
        // 点按就地展开抽屉，长按走 App 内完整设置面板
        settingsButton.setOnLongClickListener {
            callbacks.onOpenSettings()
            true
        }
        addView(controls, LayoutParams(LayoutParams.MATCH_PARENT, hit))
    }

    private fun buildDrawer() {
        val divider = View(context).apply {
            setBackgroundColor(Color.argb(26, 255, 255, 255))
        }
        drawer.addView(
            divider,
            LayoutParams(LayoutParams.MATCH_PARENT, context.dpToPxInt(1f)).apply {
                topMargin = context.dpToPxInt(DRAWER_GAP_DP)
                bottomMargin = context.dpToPxInt(DRAWER_GAP_DP)
            },
        )
        drawer.addView(buildDrawerRow(colorLabel, colorRail, true))
        drawer.addView(buildFontRow())
        colorRail.onPreview = { index -> applyTextColor(cssToArgb(textColorOptions[index])) }
        colorRail.onCommit = { index -> callbacks.onPickTextColor(textColorOptions[index]) }
        addView(drawer, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    }

    /** 抽屉的一行：左侧固定宽标签 + 右侧内容 */
    private fun buildDrawerRow(label: TextView, content: View, stretch: Boolean): View {
        val row = LinearLayout(context).apply {
            orientation = HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        row.addView(
            label,
            LayoutParams(context.dpToPxInt(DRAWER_LABEL_W_DP), LayoutParams.WRAP_CONTENT),
        )
        row.addView(
            content,
            if (stretch) {
                LayoutParams(0, context.dpToPxInt(RAIL_H_DP), 1f)
            } else {
                LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f)
            },
        )
        row.layoutParams = LayoutParams(
            LayoutParams.MATCH_PARENT,
            LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = context.dpToPxInt(DRAWER_GAP_DP) }
        return row
    }

    private fun buildFontRow(): View {
        val stepper = LinearLayout(context).apply {
            orientation = HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL or Gravity.END
        }
        fontValue.apply {
            setTextSize(TypedValue.COMPLEX_UNIT_DIP, DRAWER_LABEL_DP)
            setTextColor(Color.argb(184, 255, 255, 255))
            gravity = Gravity.CENTER
        }
        val keySize = context.dpToPxInt(STEPPER_KEY_DP)
        minusButton.background = roundKeyBackground()
        plusButton.background = roundKeyBackground()
        stepper.addView(minusButton, LayoutParams(keySize, keySize))
        stepper.addView(
            fontDots,
            LayoutParams(LayoutParams.WRAP_CONTENT, keySize).apply {
                marginStart = context.dpToPxInt(DRAWER_GAP_DP)
                marginEnd = context.dpToPxInt(DRAWER_GAP_DP)
            },
        )
        stepper.addView(
            fontValue,
            LayoutParams(context.dpToPxInt(FONT_VALUE_W_DP), LayoutParams.WRAP_CONTENT).apply {
                marginEnd = context.dpToPxInt(DRAWER_GAP_DP)
            },
        )
        stepper.addView(plusButton, LayoutParams(keySize, keySize))
        return buildDrawerRow(fontLabel, stepper, false)
    }

    private fun drawerLabel(): TextView = TextView(context).apply {
        setTextSize(TypedValue.COMPLEX_UNIT_DIP, DRAWER_LABEL_DP)
        setTextColor(Color.argb(153, 255, 255, 255))
    }

    private fun roundKeyBackground(): GradientDrawable = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.argb(36, 255, 255, 255))
    }

    private fun iconButton(iconRes: Int, onClick: () -> Unit): ImageView =
        ImageView(context).apply {
            setImageResource(iconRes)
            isClickable = true
            scaleType = ImageView.ScaleType.FIT_CENTER
            val pad = context.dpToPxInt(ICON_PADDING_DP)
            setPadding(pad, pad, pad, pad)
            setOnClickListener { onClick() }
        }

    // —— 外部接口 ——

    override fun applyStyle(config: FloatingLyricConfig) {
        fontSizeSteps = config.fontSizeSteps.ifEmpty { listOf(config.fontSize) }
        textColorOptions = config.textColorOptions
        fontSizeDp = config.fontSize.toFloat()
        showTranslation = config.showTranslation
        backgroundOpacity = config.backgroundOpacity
        applyLabels(config.labels)
        colorRail.setOptions(config.textColorOptions.map { cssToArgb(it) })
        applyTextColor(cssToArgb(config.textColor))
        applyFontSize()
        renderLines()
        renderStepper()
        setLocked(config.locked)
        renderSurface()
        markInteraction()
    }

    override fun setLine(original: String, translation: String?) {
        currentTranslation = translation
        // 交叉淡化换字，卡片不跳
        crossFade(originalView, original)
        renderLines()
    }

    override fun setPlaying(playing: Boolean) {
        this.playing = playing
        playButton.setImageResource(
            if (playing) R.drawable.ic_floating_lyric_pause else R.drawable.ic_floating_lyric_play,
        )
        playButton.contentDescription = if (playing) labels?.pause else labels?.play
    }

    /** 应用文案：可见标签 + 读屏标签一起来自 JS 的 i18n */
    private fun applyLabels(value: FloatingLyricLabels) {
        labels = value
        logoButton.contentDescription = value.openApp
        closeButton.contentDescription = value.close
        lockButton.contentDescription = value.lock
        settingsButton.contentDescription = value.settings
        previousButton.contentDescription = value.previous
        nextButton.contentDescription = value.next
        minusButton.contentDescription = value.fontSmaller
        plusButton.contentDescription = value.fontLarger
        playButton.contentDescription = if (playing) value.pause else value.play
        colorLabel.text = value.textColor
        fontLabel.text = value.fontSize
    }

    /** 锁定：底色消失、chrome 只隐藏不移除（占位保留），歌词屏幕位置零位移 */
    override fun setLocked(locked: Boolean) {
        if (this.locked == locked) {
            return
        }
        this.locked = locked
        if (locked) {
            collapseDrawer()
            cancelIdleTimer()
        }
        val chrome = if (locked) View.INVISIBLE else View.VISIBLE
        header.visibility = chrome
        controls.visibility = chrome
        animateInactiveness()
        if (!locked) {
            markInteraction()
        }
    }

    /** 拖动中：底色加深、描边加亮，松手复原 */
    override fun setDragVisual(active: Boolean) {
        dragging = active
        renderSurface()
    }

    /** 收起时复位一次性状态：抽屉、静置计时、手势、歌词内容 */
    override fun resetTransientState() {
        collapseDrawer()
        cancelIdleTimer()
        dragMoved = false
        dragging = false
        idle = false
        inactiveAnimator?.cancel()
        inactiveness = if (locked) 1f else 0f
        // 清空旧歌词：否则下次显示会先闪一下上一首
        originalView.animate().cancel()
        translationView.animate().cancel()
        originalView.text = ""
        translationView.text = ""
        currentTranslation = null
        renderSurface()
    }

    /** 宽度：左右各留 12dp，横屏 / 平板封顶 560dp，窄屏最小宽度兜底 */
    override fun windowWidth(safeWidth: Int): Int =
        (safeWidth - 2 * context.dpToPxInt(SIDE_MARGIN_DP))
            .coerceAtMost(context.dpToPxInt(MAX_WIDTH_DP))
            .coerceAtLeast(context.dpToPxInt(MIN_WIDTH_DP))

    /**
     * 收起抽屉后的基准高度：位置归一化只认它，抽屉显隐不挪卡片
     * 按各行实测高度求和而非「整卡高 − 抽屉高」——后者在布局中途两值不同步，会让卡片先跳一下再回位
     */
    override fun anchorHeight(): Int =
        paddingTop + viewHeight(header) + viewHeight(lyricBox) + viewHeight(controls) + paddingBottom

    private fun viewHeight(view: View): Int =
        if (view.height > 0) view.height else view.measuredHeight

    override fun dispose() {
        cancelIdleTimer()
        inactiveAnimator?.cancel()
        originalView.animate().cancel()
        translationView.animate().cancel()
    }

    // —— 渲染 ——

    private fun applyTextColor(argb: Int) {
        originalView.setTextColor(argb)
        translationView.setTextColor(argb)
        translationView.alpha = TRANSLATION_ALPHA
        colorRail.selectedIndex = textColorOptions.indexOfFirst { cssToArgb(it) == argb }
    }

    private fun applyFontSize() {
        val translationDp = (fontSizeDp - TRANSLATION_DP_DELTA).coerceAtLeast(MIN_TRANSLATION_DP)
        originalView.setTextSize(TypedValue.COMPLEX_UNIT_DIP, fontSizeDp)
        translationView.setTextSize(TypedValue.COMPLEX_UNIT_DIP, translationDp)
        val originalLine = context.dpToPx(fontSizeDp * LINE_HEIGHT_RATIO).roundToInt()
        val translationLine = context.dpToPx(translationDp * LINE_HEIGHT_RATIO).roundToInt()
        applyLineHeight(originalView, originalLine)
        applyLineHeight(translationView, translationLine)
        val shadow = context.dpToPx(3f)
        for (view in arrayOf(originalView, translationView)) {
            // 常驻阴影：底色淡出后唯一的可读性保障
            view.setShadowLayer(shadow, 0f, context.dpToPx(1f), Color.argb(100, 0, 0, 0))
        }
        // 歌词区恒 2 行高：两行原文与「一行原文 + 一行译文」都塞得下，译文显隐不改高度
        val boxHeight = maxOf(originalLine * 2, originalLine + translationLine) +
            context.dpToPxInt(LYRIC_PADDING_V_DP) * 2
        lyricBox.layoutParams = (lyricBox.layoutParams as LayoutParams).apply {
            height = boxHeight
        }
        lyricBox.requestLayout()
    }

    /** 行高按真实字体度量落到指定像素，避免不同字体下两行超出固定盒 */
    private fun applyLineHeight(view: TextView, lineHeightPx: Int) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            view.lineHeight = lineHeightPx
            return
        }
        val metrics = view.paint.fontMetricsInt
        val natural = metrics.descent - metrics.ascent
        view.setLineSpacing((lineHeightPx - natural).toFloat().coerceAtLeast(0f), 1f)
    }

    /** 有译文 → 上原文下译文各 1 行；无译文 → 原文自己占满 2 行 */
    private fun renderLines() {
        val translation = currentTranslation
        val visible = showTranslation && !translation.isNullOrEmpty()
        originalView.maxLines = if (visible) 1 else 2
        if (visible) {
            translationView.visibility = View.VISIBLE
            crossFade(translationView, translation.orEmpty())
        } else {
            translationView.animate().cancel()
            translationView.visibility = View.GONE
            translationView.text = ""
        }
    }

    /**
     * 交叉淡化换字：淡出 → 换字 → 淡入
     * 换新目标前先 cancel 旧动画，避免快速回切 A→B→A 落回旧文本
     */
    private fun crossFade(view: TextView, text: String) {
        view.animate().cancel()
        if (view.text.toString() == text) {
            view.alpha = textAlphaFor(view)
            return
        }
        // 空白起步（首次显示 / 刚复位）直接赋值，不做「淡出旧文本」那一段
        if (view.text.isNullOrEmpty()) {
            view.text = text
            view.alpha = 0f
            view.animate().alpha(textAlphaFor(view)).setDuration(FADE_MS).start()
            return
        }
        view.animate()
            .alpha(0f)
            .setDuration(FADE_MS)
            .withEndAction {
                view.text = text
                view.animate().alpha(textAlphaFor(view)).setDuration(FADE_MS).start()
            }
            .start()
    }

    private fun textAlphaFor(view: TextView): Float =
        if (view === translationView) TRANSLATION_ALPHA else 1f

    private fun renderStepper() {
        val index = fontSizeSteps.indexOf(fontSizeDp.roundToInt())
        fontDots.setSteps(fontSizeSteps.size, index)
        fontValue.text = fontSizeDp.roundToInt().toString()
        setStepperKeyEnabled(minusButton, index > 0)
        setStepperKeyEnabled(plusButton, index >= 0 && index < fontSizeSteps.size - 1)
    }

    private fun setStepperKeyEnabled(view: View, enabled: Boolean) {
        view.isEnabled = enabled
        view.alpha = if (enabled) 1f else DISABLED_ALPHA
    }

    /** 静置与锁定共用「退隐」外观：底色 / 描边 / chrome 一起淡出，布局不动 */
    private fun setIdle(value: Boolean) {
        if (idle == value) {
            return
        }
        idle = value
        animateInactiveness()
    }

    private fun animateInactiveness() {
        val target = if (idle || locked) 1f else 0f
        inactiveAnimator?.cancel()
        if (inactiveness == target) {
            renderSurface()
            return
        }
        inactiveAnimator = ValueAnimator.ofFloat(inactiveness, target).apply {
            duration = INACTIVE_FADE_MS
            addUpdateListener {
                inactiveness = it.animatedValue as Float
                renderSurface()
            }
            start()
        }
    }

    private fun renderSurface() {
        val visible = 1f - inactiveness
        val opacity = if (dragging) {
            (backgroundOpacity * DRAG_OPACITY_BOOST).coerceAtMost(MAX_OPACITY)
        } else {
            backgroundOpacity
        }
        surface.setColor(
            Color.argb((opacity * 255 * visible).roundToInt().coerceIn(0, 255), 0, 0, 0),
        )
        val strokeAlpha = ((if (dragging) DRAG_STROKE_ALPHA else STROKE_ALPHA) * visible)
            .roundToInt()
            .coerceIn(0, 255)
        surface.setStroke(context.dpToPxInt(1f), Color.argb(strokeAlpha, 255, 255, 255))
        val chromeAlpha = 1f - inactiveness * (1f - IDLE_CHROME_ALPHA)
        header.alpha = chromeAlpha
        controls.alpha = chromeAlpha
    }

    private fun markInteraction() {
        if (locked) {
            return
        }
        setIdle(false)
        cancelIdleTimer()
        // 抽屉展开期间不进入静置：正在调节就不该把底色淡掉
        // 读屏开启时也不进入：chrome 淡到 0 会从无障碍树消失，而触摸探索不会产生这里依赖的按下事件
        if (drawer.visibility != View.VISIBLE && !touchExplorationEnabled()) {
            handler.postDelayed(idleRunnable, IDLE_DELAY_MS)
        }
    }

    private fun touchExplorationEnabled(): Boolean {
        val manager = context.getSystemService(Context.ACCESSIBILITY_SERVICE)
            as? AccessibilityManager
        return manager?.isTouchExplorationEnabled == true
    }

    private fun cancelIdleTimer() {
        handler.removeCallbacks(idleRunnable)
    }

    private fun toggleDrawer() {
        if (drawer.visibility == View.VISIBLE) {
            collapseDrawer()
            markInteraction()
        } else {
            drawer.visibility = View.VISIBLE
            settingsButton.alpha = 1f
            cancelIdleTimer()
        }
    }

    private fun collapseDrawer() {
        drawer.visibility = View.GONE
        settingsButton.alpha = MODE_KEY_ALPHA
    }

    private fun stepFont(delta: Int) {
        val index = fontSizeSteps.indexOf(fontSizeDp.roundToInt())
        if (index < 0) {
            return
        }
        val next = (index + delta).coerceIn(0, fontSizeSteps.size - 1)
        if (next == index) {
            return
        }
        // 本地立即预览，再上报；JS 回灌同值幂等，避免调节手感等一个跨桥往返
        fontSizeDp = fontSizeSteps[next].toFloat()
        applyFontSize()
        renderStepper()
        markInteraction()
        callbacks.onPickFontSize(fontSizeSteps[next])
    }

    // —— 手势：整卡可拖，控件之上照样起拖 ——

    override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
        if (locked) {
            return false
        }
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = event.rawX
                downY = event.rawY
                dragMoved = false
                val wasIdle = idle
                markInteraction()
                // 静置时 chrome 完全不可见：这一下只用来唤醒，不能落到看不见的按钮上
                if (wasIdle) {
                    return true
                }
            }
            MotionEvent.ACTION_MOVE -> {
                if (!dragMoved && exceededSlop(event)) {
                    dragMoved = true
                    callbacks.onDragStart()
                    return true
                }
            }
        }
        return false
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (locked) {
            return false
        }
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = event.rawX
                downY = event.rawY
                dragMoved = false
                markInteraction()
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                if (!dragMoved && exceededSlop(event)) {
                    dragMoved = true
                    callbacks.onDragStart()
                }
                if (dragMoved) {
                    // 只跟随纵轴：卡片近全宽、横向恒居中
                    callbacks.onDragBy((event.rawY - downY).roundToInt())
                }
                return true
            }
            MotionEvent.ACTION_UP -> {
                if (dragMoved) {
                    callbacks.onDragEnd()
                }
                dragMoved = false
                markInteraction()
                return true
            }
            MotionEvent.ACTION_CANCEL -> {
                if (dragMoved) {
                    callbacks.onDragCancel()
                }
                dragMoved = false
                return true
            }
        }
        return false
    }

    private fun exceededSlop(event: MotionEvent): Boolean =
        abs(event.rawY - downY) > touchSlop || abs(event.rawX - downX) > touchSlop

    companion object {
        // 卡片左右各留 12dp；横屏 / 平板封顶 560dp；窄屏最小宽度兜底
        private const val SIDE_MARGIN_DP = 12f
        private const val MAX_WIDTH_DP = 560f
        private const val MIN_WIDTH_DP = 240f
        private const val RADIUS_DP = 18f
        private const val PADDING_H_DP = 14f
        private const val PADDING_TOP_DP = 6f
        private const val PADDING_BOTTOM_DP = 10f
        private const val LYRIC_PADDING_V_DP = 4f
        private const val HIT_DP = 44f
        private const val HIT_INSET_DP = 10f
        private const val ICON_PADDING_DP = 12f
        private const val LOGO_PADDING_DP = 6f
        private const val TRANSPORT_GAP_DP = 8f
        private const val DRAWER_GAP_DP = 8f
        private const val DRAWER_LABEL_W_DP = 34f
        private const val DRAWER_LABEL_DP = 12f
        private const val RAIL_H_DP = 22f
        private const val STEPPER_KEY_DP = 34f
        private const val FONT_VALUE_W_DP = 24f
        private const val LINE_HEIGHT_RATIO = 1.4f
        private const val TRANSLATION_DP_DELTA = 4f
        private const val MIN_TRANSLATION_DP = 10f
        private const val TRANSLATION_ALPHA = 0.76f
        private const val MODE_KEY_ALPHA = 0.66f
        // 静置后 chrome 完全隐去，桌面只剩歌词
        private const val IDLE_CHROME_ALPHA = 0f
        private const val DISABLED_ALPHA = 0.3f
        private const val IDLE_DELAY_MS = 5000L
        private const val INACTIVE_FADE_MS = 200L
        private const val FADE_MS = 120L
        private const val STROKE_ALPHA = 36f
        private const val DRAG_STROKE_ALPHA = 77f
        private const val DRAG_OPACITY_BOOST = 1.25
        private const val MAX_OPACITY = 0.9
    }
}

/** 色条：等宽色段连成一条，按下即选、横向滑动连续预览、松手提交 */
@SuppressLint("ViewConstructor")
private class ColorRailView(context: Context) : View(context) {
    var onPreview: ((Int) -> Unit)? = null
    var onCommit: ((Int) -> Unit)? = null
    var selectedIndex = -1
        set(value) {
            if (field != value) {
                field = value
                invalidate()
            }
        }

    private var colors: List<Int> = emptyList()
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val outline = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = context.dpToPx(1f)
        color = Color.argb(46, 255, 255, 255)
    }
    private val rect = RectF()
    private val clipPath = Path()

    fun setOptions(values: List<Int>) {
        colors = values
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        if (colors.isEmpty()) {
            return
        }
        val radius = height / 2f
        rect.set(0f, 0f, width.toFloat(), height.toFloat())
        clipPath.reset()
        clipPath.addRoundRect(rect, radius, radius, Path.Direction.CW)
        val saved = canvas.save()
        // 圆角裁切：首尾色段不能把四个角填成方的
        canvas.clipPath(clipPath)
        val segment = width.toFloat() / colors.size
        for ((index, color) in colors.withIndex()) {
            fill.color = color
            canvas.drawRect(index * segment, 0f, (index + 1) * segment, height.toFloat(), fill)
        }
        canvas.restoreToCount(saved)
        canvas.drawRoundRect(rect, radius, radius, outline)
        if (selectedIndex in colors.indices) {
            val inset = context.dpToPx(3f)
            val cx = (selectedIndex + 0.5f) * segment
            val half = (segment / 2f - inset).coerceAtLeast(context.dpToPx(4f))
            val ringRect = RectF(cx - half, inset, cx + half, height - inset)
            val ringRadius = (height / 2f) - inset
            // 外侧暗环 + 内侧白环：任何底色上都看得见选中项
            ring.color = Color.BLACK
            ring.strokeWidth = context.dpToPx(3.5f)
            canvas.drawRoundRect(ringRect, ringRadius, ringRadius, ring)
            ring.color = Color.WHITE
            ring.strokeWidth = context.dpToPx(2f)
            canvas.drawRoundRect(ringRect, ringRadius, ringRadius, ring)
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (colors.isEmpty()) {
            return false
        }
        val index = ((event.x / width) * colors.size).toInt().coerceIn(0, colors.size - 1)
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                // 色条一旦接管手势就吃到底：在色条上滑动不该把整卡拖走
                parent?.requestDisallowInterceptTouchEvent(true)
                selectedIndex = index
                onPreview?.invoke(index)
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                if (index != selectedIndex) {
                    selectedIndex = index
                    onPreview?.invoke(index)
                }
                return true
            }
            MotionEvent.ACTION_UP -> {
                parent?.requestDisallowInterceptTouchEvent(false)
                onCommit?.invoke(index)
                return true
            }
            MotionEvent.ACTION_CANCEL -> {
                parent?.requestDisallowInterceptTouchEvent(false)
                return true
            }
        }
        return false
    }
}

/** 字号档位指示：N 个圆点，当前档更大更亮 */
@SuppressLint("ViewConstructor")
private class StepDotsView(context: Context) : View(context) {
    private var count = 0
    private var active = -1
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val dotRadius = context.dpToPx(3f)
    /** 选中点放大后的半径：测量与排布都按它留边，否则首尾档被视图边界切掉一角 */
    private val activeRadius = dotRadius * ACTIVE_SCALE
    private val step = dotRadius * 2 + context.dpToPx(5f)

    fun setSteps(total: Int, activeIndex: Int) {
        count = total
        active = activeIndex
        requestLayout()
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = if (count <= 0) 0f else activeRadius * 2 + (count - 1) * step
        setMeasuredDimension(width.roundToInt(), resolveSize(0, heightMeasureSpec))
    }

    override fun onDraw(canvas: Canvas) {
        if (count <= 0) {
            return
        }
        val cy = height / 2f
        for (index in 0 until count) {
            val cx = activeRadius + index * step
            val isActive = index == active
            paint.color = if (isActive) Color.WHITE else Color.argb(77, 255, 255, 255)
            canvas.drawCircle(cx, cy, if (isActive) activeRadius else dotRadius, paint)
        }
    }

    private companion object {
        const val ACTIVE_SCALE = 1.3f
    }
}
