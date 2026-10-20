package `fun`.upup.musicfree.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.SizeF
import android.widget.RemoteViews
import android.widget.Toast
import androidx.core.content.ContextCompat
import com.doublesymmetry.trackplayer.service.MusicService
import `fun`.upup.musicfree.MainActivity
import `fun`.upup.musicfree.R
import java.util.concurrent.atomic.AtomicBoolean

open class MusicWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        appWidgetIds.forEach { update(context, manager, it) }
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
        update(context, manager, id)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_CONTROL) {
            val action = intent.getStringExtra("control") ?: return
            if (action !in setOf("toggle", "previous", "next", "shiyin")) return
            // Existing launcher instances may still hold the previous broadcast PendingIntent.
            // Forward them to the same playback service, including on cold start.
            runCatching { ContextCompat.startForegroundService(context, controlServiceIntent(context, action)) }
                .onFailure { Toast.makeText(context, R.string.widget_start_failed, Toast.LENGTH_LONG).show() }
        } else {
            updateAll(context)
        }
        val pending = goAsync()
        val finished = AtomicBoolean(false)
        val handler = Handler(Looper.getMainLooper())
        val finish = Runnable { if (finished.compareAndSet(false, true)) pending.finish() }
        // Several queued covers must not extend a broadcast beyond its time budget.
        handler.postDelayed(finish, 8_000)
        MusicWidgetStore.ensureArtwork(context) {
            handler.removeCallbacks(finish)
            finish.run()
        }
    }

    companion object {
        private const val ACTION_CONTROL = "musicfree.widget.CONTROL"
        private fun controlServiceIntent(context: Context, control: String) =
            Intent(context, MusicService::class.java).apply {
                action = ACTION_CONTROL
                putExtra("control", control)
                putExtra("widgetStatus", context.getString(if (control == "shiyin")
                    R.string.widget_discovery_loading else R.string.widget_starting))
                putExtra("widgetFailure", context.getString(R.string.widget_start_failed))
            }
        fun ids(context: Context): IntArray {
            val manager = AppWidgetManager.getInstance(context)
            return listOf(MusicWidgetProvider::class.java, MusicWidgetDarkProvider::class.java)
                .flatMap { manager.getAppWidgetIds(ComponentName(context, it)).toList() }.toIntArray()
        }

        fun updateAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            ids(context).forEach { update(context, manager, it) }
        }

        private fun update(context: Context, manager: AppWidgetManager, id: Int) {
            val dark = manager.getAppWidgetInfo(id)?.provider?.className == MusicWidgetDarkProvider::class.java.name
            val compact = if (dark) R.layout.music_widget_compact_dark else R.layout.music_widget_compact
            val expanded = if (dark) R.layout.music_widget_dark else R.layout.music_widget
            val minimumHeight = 144f * context.resources.configuration.fontScale.coerceAtLeast(1f)
            val views = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                RemoteViews(mapOf(
                    SizeF(250f, 56f) to createViews(context, compact, dark),
                    SizeF(320f, minimumHeight) to createViews(context, expanded, dark),
                ))
            } else {
                val options = manager.getAppWidgetOptions(id)
                val height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT)
                val width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)
                createViews(context, if (height >= minimumHeight && width >= 320) expanded else compact, dark)
            }
            manager.updateAppWidget(id, views)
        }

        private fun createViews(context: Context, layout: Int, dark: Boolean): RemoteViews {
            val prefs = MusicWidgetStore.preferences(context)
            val appearance = if (dark) "dark" else "light"
            val compact = layout == R.layout.music_widget_compact || layout == R.layout.music_widget_compact_dark
            val hasTrack = prefs.getBoolean("hasTrack", false)
            val ready = MusicWidgetStore.isReady()
            val playing = ready && MusicWidgetStore.playing
            val loading = ready && MusicWidgetStore.loading
            val fallback = if (dark) mapOf(
                "surface" to R.color.widget_dark_surface, "text" to R.color.widget_dark_text,
                "secondary" to R.color.widget_dark_secondary, "primary" to R.color.widget_dark_primary,
                "onPrimary" to R.color.widget_dark_on_primary, "discoverySurface" to R.color.widget_dark_discovery_surface,
                "onDiscovery" to R.color.widget_dark_on_discovery, "divider" to R.color.widget_dark_divider,
            ) else mapOf(
                "surface" to R.color.widget_light_surface, "text" to R.color.widget_light_text,
                "secondary" to R.color.widget_light_secondary, "primary" to R.color.widget_light_primary,
                "onPrimary" to R.color.widget_light_on_primary, "discoverySurface" to R.color.widget_light_discovery_surface,
                "onDiscovery" to R.color.widget_light_on_discovery, "divider" to R.color.widget_light_divider,
            )
            fun color(key: String): Int = try {
                prefs.getString("appearance_${appearance}_$key", null)?.let { Color.parseColor(it) }
                    ?: ContextCompat.getColor(context, fallback.getValue(key))
            } catch (_: IllegalArgumentException) { ContextCompat.getColor(context, fallback.getValue(key)) }
            val surface = color("surface")
            val text = color("text")
            val secondary = color("secondary")
            val primary = color("primary")
            val onPrimary = color("onPrimary")
            val title = if (hasTrack) prefs.getString("title", "").orEmpty()
                .ifBlank { context.getString(R.string.app_name) } else context.getString(R.string.widget_empty_title)
            val artist = if (hasTrack) prefs.getString("artist", "").orEmpty()
                .ifBlank { context.getString(R.string.widget_unknown_artist) } else context.getString(R.string.widget_empty_artist)
            val status = context.getString(when {
                !hasTrack -> R.string.widget_open
                !ready -> R.string.widget_resume
                loading -> R.string.widget_loading
                playing -> R.string.widget_playing
                else -> R.string.widget_paused
            })
            fun controlIntent(viewId: Int, control: String): PendingIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                PendingIntent.getForegroundService(context, viewId, controlServiceIntent(context, control),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            } else {
                PendingIntent.getService(context, viewId, controlServiceIntent(context, control),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            }
            val open = PendingIntent.getActivity(context, 100, Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                data = Uri.parse("musicfree://app/widget?action=open")
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            return RemoteViews(context.packageName, layout).apply {
                // Clear the old root click handler when the launcher reapplies an existing view.
                setOnClickPendingIntent(R.id.widget_root, null)
                setOnClickPendingIntent(R.id.widget_info, open)
                setOnClickPendingIntent(R.id.widget_cover, open)
                setTextViewText(R.id.widget_title, title)
                setTextViewText(R.id.widget_artist, artist)
                setTextViewText(R.id.widget_status, status)
                setContentDescription(R.id.widget_info, "$title, $artist, $status")
                setTextColor(R.id.widget_title, text)
                setTextColor(R.id.widget_artist, secondary)
                setTextColor(R.id.widget_status, secondary)
                if (compact) setInt(R.id.widget_background, "setColorFilter", surface)
                setInt(R.id.widget_play_background, "setColorFilter", primary)
                setInt(R.id.widget_previous, "setColorFilter", secondary)
                setInt(R.id.widget_next, "setColorFilter", secondary)
                setImageViewResource(R.id.widget_toggle, if (playing || loading) {
                    if (dark) R.drawable.widget_dark_pause else R.drawable.widget_light_pause
                } else if (dark) R.drawable.widget_dark_play else R.drawable.widget_light_play)
                setInt(R.id.widget_toggle, "setColorFilter", onPrimary)
                setContentDescription(R.id.widget_toggle, context.getString(if (playing || loading) R.string.widget_pause else R.string.widget_play))
                if (MusicWidgetStore.artworkBitmap != null) setImageViewBitmap(R.id.widget_cover, MusicWidgetStore.artworkBitmap)
                else setImageViewResource(R.id.widget_cover, R.drawable.widget_album_default)
                if (!compact) {
                    val discoverySurface = color("discoverySurface")
                    val onDiscovery = color("onDiscovery")
                    setImageViewBitmap(R.id.widget_background, MusicWidgetArtwork.background(context, dark, surface, discoverySurface, onDiscovery))
                    setInt(R.id.widget_divider, "setColorFilter", color("divider"))
                    setTextColor(R.id.widget_discovery_title, onDiscovery)
                    setTextColor(R.id.widget_discovery_subtitle, onDiscovery)
                    setTextViewText(R.id.widget_discovery_subtitle, context.getString(
                        if (ready && MusicWidgetStore.discovering) R.string.widget_discovery_loading else R.string.widget_discovery_subtitle))
                    setOnClickPendingIntent(R.id.widget_discovery, controlIntent(R.id.widget_discovery, "shiyin"))
                }
                for ((viewId, control) in listOf(R.id.widget_previous to "previous", R.id.widget_toggle to "toggle", R.id.widget_next to "next")) {
                    setOnClickPendingIntent(viewId, controlIntent(viewId, control))
                }
            }
        }
    }
}
