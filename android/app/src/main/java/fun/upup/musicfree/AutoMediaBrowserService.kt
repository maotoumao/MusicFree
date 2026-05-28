package `fun`.upup.musicfree

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.FileObserver
import android.os.Handler
import android.os.Looper
import android.support.v4.media.MediaBrowserCompat
import android.support.v4.media.MediaBrowserCompat.MediaItem
import android.support.v4.media.MediaDescriptionCompat
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.media.MediaBrowserServiceCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class AutoMediaBrowserService : MediaBrowserServiceCompat() {
    private lateinit var mediaSession: MediaSessionCompat
    private val mainHandler = Handler(Looper.getMainLooper())
    private var currentMediaId: String? = null
    private var artworkLoadVersion = 0
    private var catalogObserver: FileObserver? = null
    private val catalogRefreshRunnable = Runnable {
        notifyChildrenChanged(ROOT_ID)
        notifyChildrenChanged(QUEUE_ID)
        refreshMetadataFromCatalog()
    }

    override fun onCreate() {
        super.onCreate()

        val session = MediaSessionCompat(this, "MusicFreeAndroidAuto")
        session.setFlags(
            MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS,
        )
        session.setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() {
                    resumePlayback()
                }

                override fun onPlayFromMediaId(mediaId: String?, extras: Bundle?) {
                    playMediaId(mediaId)
                }

                override fun onPlayFromSearch(query: String?, extras: Bundle?) {
                    val normalizedQuery = query?.trim()?.lowercase().orEmpty()
                    if (normalizedQuery.isBlank()) {
                        resumePlayback()
                        return
                    }

                    val item = readCatalog().items.firstOrNull {
                        it.title.lowercase().contains(normalizedQuery) ||
                            it.artist.lowercase().contains(normalizedQuery) ||
                            it.album.lowercase().contains(normalizedQuery)
                    }
                    playMediaId(item?.mediaId)
                }

                override fun onPause() {
                    if (sendAutoCommand("pause")) {
                        session.setPlaybackState(playbackState(PlaybackStateCompat.STATE_PAUSED))
                    }
                }

                override fun onStop() {
                    if (sendAutoCommand("pause")) {
                        session.setPlaybackState(playbackState(PlaybackStateCompat.STATE_STOPPED))
                    }
                }

                override fun onSeekTo(pos: Long) {
                    val positionSeconds = (pos / 1000L).coerceAtLeast(0L)
                    if (sendAutoCommand("seek", positionSeconds = positionSeconds)) {
                        session.setPlaybackState(playbackState(PlaybackStateCompat.STATE_PLAYING, pos))
                    }
                }

                override fun onSkipToNext() {
                    playAdjacent(1, "next", PlaybackStateCompat.STATE_SKIPPING_TO_NEXT)
                }

                override fun onSkipToPrevious() {
                    playAdjacent(-1, "previous", PlaybackStateCompat.STATE_SKIPPING_TO_PREVIOUS)
                }
            })
        session.setPlaybackState(playbackState(PlaybackStateCompat.STATE_NONE))
        session.isActive = true
        mediaSession = session
        sessionToken = mediaSession.sessionToken
        startCatalogObserver()

        readCatalog().let { catalog ->
            currentMediaId = catalog.currentMediaId
            catalog.items.firstOrNull { it.mediaId == catalog.currentMediaId }?.let(::updateMetadata)
            applyPlaybackState(catalog.playbackState)
        }
    }

    override fun onDestroy() {
        catalogObserver?.stopWatching()
        catalogObserver = null
        mainHandler.removeCallbacksAndMessages(null)
        mediaSession.release()
        super.onDestroy()
    }

    override fun onGetRoot(
        clientPackageName: String,
        clientUid: Int,
        rootHints: Bundle?,
    ): BrowserRoot {
        return BrowserRoot(ROOT_ID, null)
    }

    override fun onLoadChildren(
        parentId: String,
        result: Result<MutableList<MediaBrowserCompat.MediaItem>>,
    ) {
        result.sendResult(
            when (parentId) {
                ROOT_ID -> rootItems()
                QUEUE_ID -> readCatalog().items.map { it.toMediaItem() }.toMutableList()
                else -> mutableListOf()
            },
        )
    }

    private fun rootItems(): MutableList<MediaBrowserCompat.MediaItem> {
        val catalog = readCatalog()
        val items = mutableListOf<MediaBrowserCompat.MediaItem>()

        catalog.currentMediaId?.let { currentMediaId ->
            val currentItem = catalog.items.firstOrNull { it.mediaId == currentMediaId }
            items += currentItem?.toMediaItem() ?: mediaItem(
                    mediaId = currentMediaId,
                    title = "Resume playback",
                    subtitle = getString(R.string.app_name),
                    browsable = false,
                )
        }

        items += mediaItem(
            mediaId = QUEUE_ID,
            title = "当前列表",
            subtitle = "${catalog.items.size} 首歌曲",
            browsable = true,
        )

        if (catalog.items.isEmpty()) {
            items += mediaItem(
                mediaId = EMPTY_ID,
                title = getString(R.string.app_name),
                subtitle = "Open MusicFree on your phone and start a playlist first",
                browsable = false,
            )
        }

        return items
    }

    private fun mediaItem(
        mediaId: String,
        title: String,
        subtitle: String?,
        browsable: Boolean,
        descriptionText: String? = null,
        iconUri: Uri? = null,
    ): MediaBrowserCompat.MediaItem {
        val description = MediaDescriptionCompat.Builder()
            .setMediaId(mediaId)
            .setTitle(title)
            .setSubtitle(subtitle)
            .setDescription(descriptionText)
            .setIconUri(iconUri)
            .build()

        return MediaItem(
            description,
            if (browsable) MediaItem.FLAG_BROWSABLE else MediaItem.FLAG_PLAYABLE,
        )
    }

    private fun CatalogItem.toMediaItem(): MediaBrowserCompat.MediaItem {
        val description = MediaDescriptionCompat.Builder()
            .setMediaId(mediaId)
            .setTitle(title)
            .setSubtitle(artist)
            .setDescription(album)
            .setIconUri(artworkUri())
            .build()

        return MediaItem(description, MediaItem.FLAG_PLAYABLE)
    }

    private fun playMediaId(mediaId: String?) {
        if (mediaId.isNullOrBlank() || mediaId == EMPTY_ID || mediaId == QUEUE_ID) {
            mediaSession.setPlaybackState(playbackState(PlaybackStateCompat.STATE_NONE))
            return
        }

        val item = readCatalog().items.firstOrNull { it.mediaId == mediaId }
        item?.let(::updateMetadata)
        mediaSession.setPlaybackState(playbackState(PlaybackStateCompat.STATE_BUFFERING))

        if (sendAutoCommand("play", mediaId)) {
            mediaSession.setPlaybackState(playbackState(PlaybackStateCompat.STATE_PLAYING))
            scheduleMetadataRefresh()
        } else {
            mediaSession.setPlaybackState(playbackState(PlaybackStateCompat.STATE_ERROR))
        }
    }

    private fun resumePlayback() {
        val catalog = readCatalog()
        val mediaId = currentMediaId ?: catalog.currentMediaId
        catalog.items.firstOrNull { it.mediaId == mediaId }?.let(::updateMetadata)
        if (sendAutoCommand("play")) {
            mediaSession.setPlaybackState(playbackState(PlaybackStateCompat.STATE_PLAYING))
            scheduleMetadataRefresh()
        }
    }

    private fun playAdjacent(offset: Int, command: String, transitionState: Int) {
        val catalog = readCatalog()
        if (catalog.items.isEmpty()) {
            mediaSession.setPlaybackState(playbackState(PlaybackStateCompat.STATE_NONE))
            return
        }

        val mediaId = currentMediaId ?: catalog.currentMediaId
        val currentIndex = catalog.items.indexOfFirst { it.mediaId == mediaId }.takeIf { it >= 0 } ?: 0
        val targetIndex = (currentIndex + offset + catalog.items.size) % catalog.items.size
        updateMetadata(catalog.items[targetIndex])

        mediaSession.setPlaybackState(playbackState(transitionState))
        if (sendAutoCommand(command)) {
            mediaSession.setPlaybackState(playbackState(PlaybackStateCompat.STATE_PLAYING))
            scheduleMetadataRefresh()
        } else {
            mediaSession.setPlaybackState(playbackState(PlaybackStateCompat.STATE_ERROR))
        }
    }

    private fun scheduleMetadataRefresh() {
        mainHandler.postDelayed({ refreshMetadataFromCatalog() }, 500)
        mainHandler.postDelayed({ refreshMetadataFromCatalog() }, 1500)
    }

    private fun startCatalogObserver() {
        val file = catalogFile()
        val directory = file.parentFile ?: return
        directory.mkdirs()

        catalogObserver = object : FileObserver(
            directory.absolutePath,
            FileObserver.CLOSE_WRITE or
                FileObserver.MOVED_TO or
                FileObserver.CREATE or
                FileObserver.MODIFY,
        ) {
            override fun onEvent(event: Int, path: String?) {
                if (path != file.name) {
                    return
                }

                mainHandler.removeCallbacks(catalogRefreshRunnable)
                mainHandler.postDelayed(catalogRefreshRunnable, 100)
            }
        }
        catalogObserver?.startWatching()
    }

    private fun refreshMetadataFromCatalog() {
        val catalog = readCatalog()
        val targetMediaId = catalog.currentMediaId ?: currentMediaId
        catalog.items.firstOrNull { it.mediaId == targetMediaId }?.let(::updateMetadata)
        applyPlaybackState(catalog.playbackState)
    }

    private fun applyPlaybackState(stateName: String?) {
        val state = when (stateName) {
            "playing" -> PlaybackStateCompat.STATE_PLAYING
            "paused", "ready" -> PlaybackStateCompat.STATE_PAUSED
            "stopped", "none", "ended" -> PlaybackStateCompat.STATE_STOPPED
            "loading", "buffering" -> PlaybackStateCompat.STATE_BUFFERING
            "error" -> PlaybackStateCompat.STATE_ERROR
            else -> return
        }
        mediaSession.setPlaybackState(playbackState(state))
    }

    private fun updateMetadata(item: CatalogItem) {
        currentMediaId = item.mediaId
        val builder = metadataBuilder(item)
        mediaSession.setMetadata(builder.build())
        loadArtworkAsync(item)
    }

    private fun metadataBuilder(item: CatalogItem, artwork: Bitmap? = null): MediaMetadataCompat.Builder {
        val builder = MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, item.title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, item.artist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, item.album)
            .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_TITLE, item.title)
            .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_SUBTITLE, item.artist)
            .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_DESCRIPTION, item.album)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, item.duration * 1000L)

        val artworkUri = item.normalizedArtwork()
        if (artworkUri != null) {
            builder
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ART_URI, artworkUri)
                .putString(MediaMetadataCompat.METADATA_KEY_ART_URI, artworkUri)
                .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON_URI, artworkUri)
        }

        if (artwork != null) {
            builder
                .putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artwork)
                .putBitmap(MediaMetadataCompat.METADATA_KEY_ART, artwork)
                .putBitmap(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON, artwork)
        }

        return builder
    }

    private fun loadArtworkAsync(item: CatalogItem) {
        val artwork = item.normalizedArtwork() ?: return
        if (artwork.isBlank()) {
            return
        }

        val expectedMediaId = item.mediaId
        val version = ++artworkLoadVersion
        Thread {
            val bitmap = loadArtworkBitmap(artwork) ?: return@Thread
            mainHandler.post {
                if (currentMediaId == expectedMediaId && version == artworkLoadVersion) {
                    mediaSession.setMetadata(metadataBuilder(item, bitmap).build())
                }
            }
        }.start()
    }

    private fun loadArtworkBitmap(artwork: String): Bitmap? {
        return runCatching {
            val uri = Uri.parse(artwork)
            val rawBitmap = when (uri.scheme?.lowercase()) {
                "http", "https" -> {
                    val connection = URL(artwork).openConnection()
                    connection.connectTimeout = 3000
                    connection.readTimeout = 5000
                    connection.setRequestProperty("User-Agent", ARTWORK_USER_AGENT)
                    connection.setRequestProperty("Accept", "image/webp,image/apng,image/*,*/*;q=0.8")
                    if (connection is HttpURLConnection) {
                        connection.instanceFollowRedirects = true
                    }
                    connection.getInputStream().use(BitmapFactory::decodeStream)
                }
                "file" -> BitmapFactory.decodeFile(uri.path)
                "content" -> contentResolver.openInputStream(uri)?.use(BitmapFactory::decodeStream)
                else -> BitmapFactory.decodeFile(artwork)
            } ?: return null

            scaleArtwork(rawBitmap)
        }.getOrNull()
    }

    private fun scaleArtwork(bitmap: Bitmap): Bitmap {
        val maxSize = 512
        if (bitmap.width <= maxSize && bitmap.height <= maxSize) {
            return bitmap
        }

        val scale = minOf(maxSize.toFloat() / bitmap.width, maxSize.toFloat() / bitmap.height)
        return Bitmap.createScaledBitmap(
            bitmap,
            (bitmap.width * scale).toInt().coerceAtLeast(1),
            (bitmap.height * scale).toInt().coerceAtLeast(1),
            true,
        )
    }

    private fun CatalogItem.artworkUri(): Uri? {
        return normalizedArtwork()
            ?.let { runCatching { Uri.parse(it) }.getOrNull() }
    }

    private fun CatalogItem.normalizedArtwork(): String? {
        val trimmedArtwork = artwork.trim().takeIf { it.isNotBlank() } ?: return null
        return if (trimmedArtwork.startsWith("//")) {
            "https:$trimmedArtwork"
        } else {
            trimmedArtwork
        }
    }

    private fun sendAutoCommand(
        command: String,
        mediaId: String? = null,
        positionSeconds: Long? = null,
    ): Boolean {
        return runCatching {
            writePendingCommand(command, mediaId, positionSeconds)
            startTrackPlayerService()
            true
        }.getOrDefault(false)
    }

    private fun writePendingCommand(
        command: String,
        mediaId: String?,
        positionSeconds: Long?,
    ) {
        val file = commandFile()
        file.parentFile?.mkdirs()
        val json = JSONObject()
            .put("id", System.currentTimeMillis())
            .put("command", command)
            .put("mediaId", mediaId ?: JSONObject.NULL)
            .put("position", positionSeconds ?: JSONObject.NULL)
        file.writeText(json.toString())
    }

    private fun startTrackPlayerService() {
        val intent = Intent().setClassName(
            packageName,
            "com.doublesymmetry.trackplayer.service.MusicService",
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    private fun playbackState(
        state: Int,
        positionMs: Long = PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN,
    ): PlaybackStateCompat {
        val speed = if (state == PlaybackStateCompat.STATE_PLAYING) 1f else 0f
        return PlaybackStateCompat.Builder()
            .setActions(
                PlaybackStateCompat.ACTION_PLAY or
                    PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID or
                    PlaybackStateCompat.ACTION_PLAY_FROM_SEARCH or
                    PlaybackStateCompat.ACTION_PAUSE or
                    PlaybackStateCompat.ACTION_STOP or
                    PlaybackStateCompat.ACTION_SEEK_TO or
                    PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                    PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS,
            )
            .setState(state, positionMs, speed)
            .build()
    }

    private fun catalogFile(): File {
        val baseDir = getExternalFilesDir(null) ?: filesDir
        return File(baseDir, "data/android_auto_catalog.json")
    }

    private fun commandFile(): File {
        val baseDir = getExternalFilesDir(null) ?: filesDir
        return File(baseDir, "data/android_auto_command.json")
    }

    private fun readCatalog(): Catalog {
        val file = catalogFile()
        if (!file.exists()) {
            return Catalog()
        }

        return runCatching {
            val json = JSONObject(file.readText())
            val items = json.optJSONArray("items").orEmpty().mapNotNull { raw ->
                (raw as? JSONObject)?.let {
                    CatalogItem(
                        mediaId = it.optString("mediaId"),
                        title = it.optString("title", getString(R.string.app_name)),
                        artist = it.optString("artist"),
                        album = it.optString("album"),
                        artwork = it.optString("artwork"),
                        duration = it.optLong("duration", 0L),
                    )
                }
            }.filter { it.mediaId.isNotBlank() }

            Catalog(
                currentMediaId = json.optString("currentMediaId").takeIf { it.isNotBlank() && it != "null" },
                playbackState = json.optString("playbackState").takeIf { it.isNotBlank() && it != "null" },
                items = items,
            )
        }.getOrElse {
            Catalog()
        }
    }

    private fun JSONArray?.orEmpty(): List<Any?> {
        if (this == null) {
            return emptyList()
        }
        return List(length()) { index -> opt(index) }
    }

    private data class Catalog(
        val currentMediaId: String? = null,
        val playbackState: String? = null,
        val items: List<CatalogItem> = emptyList(),
    )

    private data class CatalogItem(
        val mediaId: String,
        val title: String,
        val artist: String,
        val album: String,
        val artwork: String,
        val duration: Long,
    )

    companion object {
        private const val ROOT_ID = "musicfree_root"
        private const val QUEUE_ID = "musicfree_queue"
        private const val EMPTY_ID = "musicfree_empty"
        private const val ARTWORK_USER_AGENT =
            "Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 (KHTML, like Gecko) MusicFree/AndroidAuto"
    }
}
