package `fun`.upup.musicfree.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.SizeF
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import com.doublesymmetry.trackplayer.service.MusicService
import `fun`.upup.musicfree.MainActivity
import `fun`.upup.musicfree.R
import java.util.concurrent.atomic.AtomicBoolean

class MusicWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { update(context, manager, it) }
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
        update(context, manager, id)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        val pending = goAsync()
        val finished = AtomicBoolean(false)
        val handler = Handler(Looper.getMainLooper())
        val finish = Runnable { if (finished.compareAndSet(false, true)) pending.finish() }
        handler.postDelayed(finish, 8_000)
        MusicWidgetStore.ensureArtwork(context) {
            handler.removeCallbacks(finish)
            finish.run()
        }
    }

    companion object {
        fun ids(context: Context): IntArray = AppWidgetManager.getInstance(context)
            .getAppWidgetIds(ComponentName(context, MusicWidgetProvider::class.java))

        fun updateAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            ids(context).forEach { update(context, manager, it) }
        }

        private fun update(context: Context, manager: AppWidgetManager, id: Int) {
            val minimumHeight = 140f * context.resources.configuration.fontScale.coerceAtLeast(1f)
            val views = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                RemoteViews(mapOf(
                    SizeF(250f, 72f) to createViews(context, R.layout.music_widget_compact),
                    SizeF(250f, minimumHeight) to createViews(context, R.layout.music_widget),
                ))
            } else {
                val height = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT)
                createViews(context, if (height >= minimumHeight) R.layout.music_widget else R.layout.music_widget_compact)
            }
            manager.updateAppWidget(id, views)
        }

        private fun createViews(context: Context, layout: Int): RemoteViews {
            val prefs = MusicWidgetStore.preferences(context)
            val hasTrack = prefs.getBoolean("hasTrack", false)
            val ready = MusicWidgetStore.isReady()
            val playing = ready && MusicWidgetStore.playing
            val loading = ready && MusicWidgetStore.loading
            val defaults = mapOf(
                "surface" to R.color.widget_surface, "text" to R.color.widget_text,
                "secondary" to R.color.widget_secondary, "primary" to R.color.widget_primary,
                "onPrimary" to R.color.widget_on_primary,
            )
            fun color(key: String): Int = try {
                prefs.getString(key, null)?.let { Color.parseColor(it) }
                    ?: ContextCompat.getColor(context, defaults.getValue(key))
            } catch (_: IllegalArgumentException) { ContextCompat.getColor(context, defaults.getValue(key)) }
            val title = if (hasTrack) prefs.getString("title", "").orEmpty()
                .ifBlank { context.getString(R.string.app_name) } else context.getString(R.string.widget_empty_title)
            val artist = if (hasTrack) prefs.getString("artist", "").orEmpty()
                .ifBlank { context.getString(R.string.widget_unknown_artist) } else context.getString(R.string.widget_empty_artist)
            val status = context.getString(when {
                loading -> R.string.widget_loading
                playing -> R.string.widget_playing
                else -> R.string.widget_paused
            })
            val open = PendingIntent.getActivity(context, 100,
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            return RemoteViews(context.packageName, layout).apply {
                setOnClickPendingIntent(R.id.widget_info, open)
                setOnClickPendingIntent(R.id.widget_cover, open)
                setTextViewText(R.id.widget_title, title)
                setTextViewText(R.id.widget_artist, artist)
                setContentDescription(R.id.widget_info, "$title, $artist, $status")
                setTextColor(R.id.widget_title, color("text"))
                setTextColor(R.id.widget_artist, color("secondary"))
                setInt(R.id.widget_background, "setColorFilter", color("surface"))
                setInt(R.id.widget_play_background, "setColorFilter", color("primary"))
                setInt(R.id.widget_previous, "setColorFilter", color("secondary"))
                setInt(R.id.widget_next, "setColorFilter", color("secondary"))
                setImageViewResource(R.id.widget_toggle, if (playing || loading) R.drawable.widget_pause else R.drawable.widget_play)
                setInt(R.id.widget_toggle, "setColorFilter", color("onPrimary"))
                setContentDescription(R.id.widget_toggle, context.getString(if (playing || loading) R.string.widget_pause else R.string.widget_play))
                MusicWidgetStore.artworkBitmap?.let { setImageViewBitmap(R.id.widget_cover, it) }
                    ?: setImageViewResource(R.id.widget_cover, R.drawable.widget_album_default)
                for ((viewId, control) in listOf(R.id.widget_previous to "previous", R.id.widget_toggle to "toggle", R.id.widget_next to "next")) {
                    val intent = Intent(context, MusicService::class.java).apply {
                        action = "musicfree.widget.CONTROL"
                        putExtra("control", control)
                        putExtra("widgetStatus", context.getString(R.string.widget_starting))
                        putExtra("widgetFailure", context.getString(R.string.widget_start_failed))
                    }
                    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    val pending = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        PendingIntent.getForegroundService(context, viewId, intent, flags)
                    } else PendingIntent.getService(context, viewId, intent, flags)
                    setOnClickPendingIntent(viewId, pending)
                }
            }
        }
    }
}
