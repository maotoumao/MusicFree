package `fun`.upup.musicfree.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.RemoteViews
import java.net.URL
import java.util.concurrent.Executors
import `fun`.upup.musicfree.R

class MusicWidgetProvider : AppWidgetProvider() {
    
    companion object {
        private const val TAG = "MusicWidgetProvider"
        const val ACTION_PREVIOUS = "ACTION_PREVIOUS"
        const val ACTION_PLAY_PAUSE = "ACTION_PLAY_PAUSE"
        const val ACTION_NEXT = "ACTION_NEXT"
        const val ACTION_WIDGET_UPDATE = "ACTION_WIDGET_UPDATE"
        
        fun updateWidget(context: Context, songInfo: SongInfo) {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val componentName = ComponentName(context, MusicWidgetProvider::class.java)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(componentName)
            
            for (appWidgetId in appWidgetIds) {
                updateAppWidget(context, appWidgetManager, appWidgetId, songInfo)
            }
        }
        
        private fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int,
            songInfo: SongInfo
        ) {
            val views = RemoteViews(context.packageName, R.layout.music_widget_layout)
            
            // 设置歌曲信息
            val songText = if (songInfo.title.isNotEmpty() && songInfo.artist.isNotEmpty()) {
                "${songInfo.title} - ${songInfo.artist}"
            } else if (songInfo.title.isNotEmpty()) {
                songInfo.title
            } else {
                "No music playing"
            }
            
            views.setTextViewText(R.id.song_info, songText)
            
            // 设置播放/暂停按钮图标
            val playPauseIcon = if (songInfo.isPlaying) {
                R.drawable.ic_pause
            } else {
                R.drawable.ic_play
            }
            views.setImageViewResource(R.id.btn_play_pause, playPauseIcon)
            
            // 加载封面图片
            if (songInfo.artwork.isNotEmpty()) {
                loadArtwork(context, views, songInfo.artwork, appWidgetManager, appWidgetId)
            } else {
                views.setImageViewResource(R.id.album_cover, R.drawable.ic_music_note)
                appWidgetManager.updateAppWidget(appWidgetId, views)
            }
            
            // 设置点击事件
            setupClickListeners(context, views, appWidgetId)
            
            if (songInfo.artwork.isEmpty()) {
                appWidgetManager.updateAppWidget(appWidgetId, views)
            }
        }
        
        private fun loadArtwork(
            context: Context,
            views: RemoteViews,
            artworkUrl: String,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val executor = Executors.newSingleThreadExecutor()
            val handler = Handler(Looper.getMainLooper())
            
            executor.execute {
                try {
                    val url = URL(artworkUrl)
                    val bitmap = BitmapFactory.decodeStream(url.openConnection().getInputStream())
                    
                    handler.post {
                        if (bitmap != null) {
                            // 缩放图片以适应小部件
                            val scaledBitmap = Bitmap.createScaledBitmap(bitmap, 64, 64, true)
                            views.setImageViewBitmap(R.id.album_cover, scaledBitmap)
                        } else {
                            views.setImageViewResource(R.id.album_cover, R.drawable.ic_music_note)
                        }
                        appWidgetManager.updateAppWidget(appWidgetId, views)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to load artwork: ${e.message}")
                    handler.post {
                        views.setImageViewResource(R.id.album_cover, R.drawable.ic_music_note)
                        appWidgetManager.updateAppWidget(appWidgetId, views)
                    }
                }
            }
        }
        
        private fun setupClickListeners(context: Context, views: RemoteViews, appWidgetId: Int) {
            // 上一首
            val previousIntent = Intent(context, MusicWidgetProvider::class.java).apply {
                action = ACTION_PREVIOUS
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
            }
            val previousPendingIntent = PendingIntent.getBroadcast(
                context, 0, previousIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.btn_previous, previousPendingIntent)
            
            // 播放/暂停
            val playPauseIntent = Intent(context, MusicWidgetProvider::class.java).apply {
                action = ACTION_PLAY_PAUSE
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
            }
            val playPausePendingIntent = PendingIntent.getBroadcast(
                context, 1, playPauseIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.btn_play_pause, playPausePendingIntent)
            
            // 下一首
            val nextIntent = Intent(context, MusicWidgetProvider::class.java).apply {
                action = ACTION_NEXT
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
            }
            val nextPendingIntent = PendingIntent.getBroadcast(
                context, 2, nextIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.btn_next, nextPendingIntent)
        }
    }
    
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        Log.d(TAG, "onUpdate called with ${appWidgetIds.size} widgets")
        
        // 通知React Native层请求最新的音乐信息
        MusicWidgetModule.requestCurrentSong(context)
        
        // 使用默认信息更新小部件
        val defaultSongInfo = SongInfo("", "", "", false)
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId, defaultSongInfo)
        }
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        
        Log.d(TAG, "onReceive: ${intent.action}")
        
        when (intent.action) {
            ACTION_PREVIOUS -> {
                Log.d(TAG, "Previous button clicked")
                MusicWidgetModule.sendAction(context, "previous")
            }
            ACTION_PLAY_PAUSE -> {
                Log.d(TAG, "Play/Pause button clicked")
                MusicWidgetModule.sendAction(context, "playpause")
            }
            ACTION_NEXT -> {
                Log.d(TAG, "Next button clicked")
                MusicWidgetModule.sendAction(context, "next")
            }
            ACTION_WIDGET_UPDATE -> {
                Log.d(TAG, "Widget update requested")
                // 这个action由JS层调用来更新小部件
            }
        }
    }
    
    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        Log.d(TAG, "Widget enabled")
    }
    
    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        Log.d(TAG, "Widget disabled")
    }
}
