package `fun`.upup.musicfree.audio

import android.os.Bundle
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.CommandButton
import androidx.media3.session.SessionCommand
import `fun`.upup.musicfree.R

/**
 * 通知栏自定义按钮的外观规格。
 * 位置与图标定死在原生（通知 action 图标只能是编译进 APK 的 drawable），
 * 状态与文案由 JS 下发；原生不解释按钮含义，点击只回传标识交 JS 决策。
 * 不含播放三连——那是 Media3 按 player 声明的可用命令自动生成的
 */
@OptIn(UnstableApi::class)
object CustomNotificationButtons {

    /** 全部自定义按钮共用的会话命令；具体按哪个按钮放在 extras 里 */
    const val CUSTOM_ACTION = "fun.upup.musicfree.NOTIFICATION_BUTTON"

    /** extras 中按钮标识的 key */
    const val KEY_BUTTON = "button"

    const val BUTTON_FAVORITE = "favorite"
    const val BUTTON_LYRIC = "lyric"

    /** 排在上一首左侧的按钮；其余排在下一首右侧 */
    private val LEADING = setOf(BUTTON_FAVORITE)

    /** JS 下发的一个按钮：状态决定图标，标题用于无障碍与长按提示 */
    data class Spec(val button: String, val state: String, val title: String)

    private fun iconOf(button: String, state: String): Int? = when (button) {
        BUTTON_FAVORITE -> when (state) {
            "on" -> R.drawable.ic_notification_favorite_filled
            "off" -> R.drawable.ic_notification_favorite
            else -> null
        }

        BUTTON_LYRIC -> when (state) {
            "on" -> R.drawable.ic_notification_lyric
            "off" -> R.drawable.ic_notification_lyric_off
            "locked" -> R.drawable.ic_notification_lyric_locked
            else -> null
        }

        else -> null
    }

    fun isLeading(button: String): Boolean = button in LEADING

    fun isKnown(button: String): Boolean =
        button == BUTTON_FAVORITE || button == BUTTON_LYRIC

    /** 取某个 CommandButton 承载的按钮标识；非自定义按钮（播放三连）返回 null */
    fun buttonIdOf(button: CommandButton): String? {
        val command = button.sessionCommand ?: return null
        if (command.customAction != CUSTOM_ACTION) return null
        return command.customExtras.getString(KEY_BUTTON)
    }

    /**
     * 未知按钮或未知状态一律跳过，不因 JS 传错值而崩。
     * 标题必须非空：Media3 为兼容旧 controller 会把按钮投射成 PlaybackStateCompat.CustomAction，
     * 那里空标题会抛异常
     */
    fun toCommandButton(spec: Spec): CommandButton? {
        if (spec.title.isBlank()) return null
        val icon = iconOf(spec.button, spec.state) ?: return null
        val extras = Bundle().apply { putString(KEY_BUTTON, spec.button) }
        return CommandButton.Builder(CommandButton.ICON_UNDEFINED)
            .setSessionCommand(SessionCommand(CUSTOM_ACTION, extras))
            .setCustomIconResId(icon)
            .setDisplayName(spec.title)
            // 落位由 MusicFreeNotificationProvider 重排；此处必须声明 OVERFLOW，
            // 否则 Media3 组装通知按钮时会把没有可用槽的按钮直接丢弃
            .setSlots(CommandButton.SLOT_OVERFLOW)
            .build()
    }
}
