package `fun`.upup.musicfree.audio

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.media.AudioManager
import android.media.audiofx.Equalizer
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.annotation.OptIn
import androidx.core.content.ContextCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.BitmapLoader
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSourceBitmapLoader
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.dash.DashMediaSource
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy
import androidx.media3.exoplayer.upstream.LoadErrorHandlingPolicy
import androidx.media3.session.CacheBitmapLoader
import androidx.media3.session.MediaController
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import `fun`.upup.musicfree.MainActivity
import `fun`.upup.musicfree.R
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.Locale
import java.util.concurrent.CancellationException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import okhttp3.OkHttpClient

internal class LatestOnlyMailbox<T> {
    data class Delivery<T>(val id: Int, val value: T)

    private var nextId = 0
    private var inFlight: Delivery<T>? = null
    private var pending: T? = null

    fun offer(value: T): Delivery<T>? {
        if (inFlight != null) {
            pending = value
            return null
        }
        return deliver(value)
    }

    fun acknowledge(id: Int): Delivery<T>? {
        if (inFlight?.id != id) return null
        inFlight = null
        val latest = pending ?: return null
        pending = null
        return deliver(latest)
    }

    fun reset() {
        inFlight = null
        pending = null
    }

    private fun deliver(value: T): Delivery<T> {
        nextId = if (nextId == Int.MAX_VALUE) 1 else nextId + 1
        return Delivery(nextId, value).also { inFlight = it }
    }
}

/** 进程级单例播放引擎：ExoPlayer + MediaSession，所有 player 操作在主线程。 */
@OptIn(UnstableApi::class)
object AudioEngine {

    /** 引擎向外（TurboModule）回传的事件。 */
    interface Listener {
        fun onStateChanged(state: String)
        fun onProgress(deliveryId: Int, positionSec: Double, durationSec: Double, bufferedSec: Double, slotId: Long)
        fun onError(item: SlotItem?, slot: String, code: String, message: String)
        /** 一首自然播完（AUTO 过渡）；ended=刚播完、promoted=引擎无缝晋升的新当前曲（队列到底为 null）。 */
        fun onAudioEnd(ended: SlotItem, promoted: SlotItem?)
        /** 某媒体项首次真正出声（按 slotId 去重，resume 不发）。 */
        fun onStarted(item: SlotItem)
        /** 从码流元数据里解出了当前项的内嵌封面并已落成缓存文件；只在该项没带 artwork 时发、每次 load 最多一次。 */
        fun onEmbeddedArtwork(item: SlotItem, uri: String)
        /** 请 JS 解析某槽音源；JS 解析完调 provideSource(requestId) 回填。 */
        fun onResolveSource(requestId: Int, item: SlotItem)
        /** 远程控制（通知/锁屏/蓝牙）：next/prev/stop 交 JS（队列 SoT 在 JS）。 */
        fun onRemote(command: String)
        /** 通知栏自定义按钮被点击；原生不解释含义，由 JS 按当前状态决策。 */
        fun onCustomNotificationButton(button: String)
    }

    /** 槽的瘦身份 + 展示信息（对应 JS 的 AudioItem，完整 musicItem 留在 JS）。 */
    data class SlotItem(
        val platform: String,
        val id: String,
        /** 本次 load 的 occurrence 号（JS 分配、每次 setAudio/setNext 换新号）；原生不透明、只存并在事件回带；缺省 -1 */
        val slotId: Long,
        val cacheKey: String,
        val streamType: String?,
        val title: String?,
        val artist: String?,
        val album: String?,
        val artwork: String?,
        val duration: Double?,
        /** 是否从码流元数据提取内嵌封面回传 JS；本地歌为 false（其封面另有 TagLib 链路） */
        val extractEmbeddedArtwork: Boolean = true,
    )

    private data class ResolvedSource(val url: String, val headers: Map<String, String>)

    private class PendingResolve(val cacheKey: String) {
        val latch = CountDownLatch(1)
        val completed = AtomicBoolean(false)
        @Volatile var result: ResolvedSource? = null
    }

    /** resolver 阶段真失败标记（拿不到源），归 E_RESOLVE。item=失败那次 load 的快照（含其 slotId），供 onError 精确归属、即使已不在 live 槽也不误写成当前曲。 */
    private class ResolveException(message: String, val item: SlotItem? = null) : IOException(message)

    /** resolver 因换源/取消/stale 而中止（非真失败），onPlayerError 遇到则忽略不上报。 */
    private class CancelledResolveException(message: String) : IOException(message)

    private val mainHandler = Handler(Looper.getMainLooper())
    private var player: ExoPlayer? = null
    private var session: MediaSession? = null

    /** resolver 在 loader 后台线程读，write 在主线程，需 volatile 保可见性。 */
    @Volatile private var listener: Listener? = null
    private var progressIntervalMs: Long = DEFAULT_PROGRESS_MS

    /** stop() 与自然到底都进 STATE_IDLE/ENDED，用它区分 idle(未加载) 与 stopped(停止)。 */
    private var stopped = false

    /** 当前 item 首次 READY 前为 true，用于区分 loading(首缓冲) 与 buffering(播放中卡顿)。 */
    private var loading = false

    /** 播放错误激活中，直到 setMediaUrl/play(prepare)/stop/reset 主动清除。 */
    private var errored = false

    /** 已发过 onStarted 的 slotId（一次 load 只发一次；resume 同 slotId 不重发；slotId 单调递增故无需 reset）。 */
    private var startedSlotId: Long = Long.MIN_VALUE
    /** 已回传过内嵌封面的 load occurrence：updateMeta 换 MediaItem 元数据会再触发 onMediaMetadataChanged，别重复发 */
    private var embeddedArtworkSlotId: Long = Long.MIN_VALUE

    /** 上次已发出的状态，去重避免同值重复 emit（一次 play 会触发多个回调）。 */
    private var lastState: String? = null

    /** 进度循环是否在跑；仅播放中 + 停播后的尾巴窗口内跑。 */
    private var ticking = false

    private data class ProgressSample(
        val positionSec: Double,
        val durationSec: Double,
        val bufferedSec: Double,
        val slotId: Long,
    )

    private val progressMailbox = LatestOnlyMailbox<ProgressSample>()

    /** 停播后再拖一段才停发进度的截止时刻（uptime）。 */
    private var tailUntilMs = 0L

    /**
     * 两槽的单一真相源（index0=curr，index1=next）；不可变 list + volatile 原子替换。
     * resolver 按 cacheKey 判有效——只要 cacheKey 还在某个槽里就算有效（同一首歌，不看 SlotItem 实例，
     * 故 updateMeta / 重复 set 同一首不会误取消在途解析）；换成别的歌或清空即作废。
     */
    @Volatile private var slots: List<SlotItem> = emptyList()

    /** 在途解析请求：requestId → 阻塞句柄。 */
    private val pending = ConcurrentHashMap<Int, PendingResolve>()
    private val requestSeq = AtomicInteger(0)

    /** appContext / OkHttp http 工厂 / 缓存单例 / 边下边播开关；缓存维护在后台线程。 */
    private var appContext: Context? = null
    private var httpFactory: DataSource.Factory? = null
    @Volatile private var simpleCache: SimpleCache? = null
    @Volatile private var cacheEnabled = false
    private val cacheExecutor: ExecutorService = Executors.newSingleThreadExecutor()

    /**
     * 均衡器：绑到 init 时定死的 audioSessionId，单实例；建失败则 sticky 降级(eqUnavailable)。
     * band 配置的真相源 = 活着的 Equalizer 本体(固定 session 不重建不丢)，故无需影子配置。
     */
    private var audioSessionId = C.AUDIO_SESSION_ID_UNSET
    private var equalizer: Equalizer? = null
    private var eqEnabled = false
    private var eqUnavailable = false

    val mediaSession: MediaSession?
        get() = session

    /**
     * 进程内 keep-alive controller：绑定 MusicFreeAudioService 钉住其生命周期。
     * MediaSessionService 是 bound service，无 controller 绑定则后台会被销毁；播放转前台时的自启意图会因落到新实例
     * (UID 不符) 被判 stale 而撤掉通知（暂停走普通 notify 不受影响 → 表现为「暂停有、播放没」）。
     * 由 setup() 的 ensureServiceBound 建、进程存活期持有；仅 onTaskRemoved 暂停态退出时主动解绑
     */
    private var keepAliveController: ListenableFuture<MediaController>? = null

    /** 主动解绑标记：置真时 onDisconnected 不自动重绑，区分意外断连（自愈重绑）与主动释放（退出） */
    private var keepAliveReleasing = false

    /** keep-alive controller 断连回调：清代际；非主动释放且引擎在世则重绑（EMUI 单杀 service 的自愈） */
    private val keepAliveControllerListener: MediaController.Listener = object : MediaController.Listener {
        override fun onDisconnected(controller: MediaController) {
            keepAliveController = null
            if (!keepAliveReleasing && player != null) ensureServiceBound()
        }
    }

    fun setListener(l: Listener?) = runOnMain {
        listener = l
        lastState = null
        progressMailbox.reset()
    }

    /** 仅当当前 listener 就是 l 时清除，避免新 module 覆盖后被旧实例误清；清空槽并取消在途解析（无 JS 可回填）。 */
    fun clearListener(l: Listener) = runOnMain {
        if (listener === l) {
            listener = null
            progressMailbox.reset()
            slots = emptyList()
            cancelStalePending()
        }
    }

    fun acknowledgeProgress(deliveryId: Int) = runOnMain {
        progressMailbox.acknowledge(deliveryId)?.let(::emitProgressDelivery)
    }

    /**
     * 自定义按钮全部复用同一条会话命令（按钮标识走 extras），
     * 这样按钮表随播放状态频繁变化时无需重新授权命令集。
     * 服务是 exported 的，任何应用都能连上会话，故该命令只授权给系统通知 controller
     */
    private val sessionCallback = object : MediaSession.Callback {
        override fun onConnect(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
        ): MediaSession.ConnectionResult {
            val accepted = MediaSession.ConnectionResult.AcceptedResultBuilder(session)
            if (!session.isMediaNotificationController(controller)) return accepted.build()
            val commands = MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon()
                .add(SessionCommand(CustomNotificationButtons.CUSTOM_ACTION, Bundle.EMPTY))
                .build()
            return accepted.setAvailableSessionCommands(commands).build()
        }

        override fun onCustomCommand(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            customCommand: SessionCommand,
            args: Bundle,
        ): ListenableFuture<SessionResult> {
            if (customCommand.customAction != CustomNotificationButtons.CUSTOM_ACTION) {
                return Futures.immediateFuture(
                    SessionResult(SessionResult.RESULT_ERROR_NOT_SUPPORTED),
                )
            }
            val button = customCommand.customExtras
                .getString(CustomNotificationButtons.KEY_BUTTON)
            if (button == null || !CustomNotificationButtons.isKnown(button)) {
                return Futures.immediateFuture(
                    SessionResult(SessionResult.RESULT_ERROR_BAD_VALUE),
                )
            }
            listener?.onCustomNotificationButton(button)
            return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
        }
    }

    /** 全量替换通知栏自定义按钮；状态与文案由 JS 给，图标与落位在原生。 */
    fun setCustomNotificationButtons(specs: List<CustomNotificationButtons.Spec>) = runOnMain {
        val buttons = specs.mapNotNull(CustomNotificationButtons::toCommandButton)
        session?.setMediaButtonPreferences(buttons)
    }

    fun init(context: Context) = runOnMain {
        if (player != null) return@runOnMain
        val appCtx = context.applicationContext
        val attrs = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build()
        val p = ExoPlayer.Builder(appCtx)
            .setAudioAttributes(attrs, true)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()
        p.addListener(playerListener)
        player = p
        // 包一层拦截远程 prev/next/stop：恒显 prev/next 按钮 + 交 JS（队列 SoT 在 JS）
        val forwarding = MusicFreeForwardingPlayer(p) { cmd ->
            if (cmd == MusicFreeForwardingPlayer.CMD_STOP) stop() // 引擎完整 stop（stopped/seek0/emitState）
            listener?.onRemote(cmd)
        }
        // 通知点击主体拉起 MainActivity 把 app 带到前台（singleTask：热态回前台、冷态启动）
        val openApp = PendingIntent.getActivity(
            appCtx,
            0,
            Intent(appCtx, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )
        session = MediaSession.Builder(appCtx, forwarding)
            .setSessionActivity(openApp)
            .setCallback(sessionCallback)
            .setBitmapLoader(
                FallbackBitmapLoader(
                    CacheBitmapLoader(DataSourceBitmapLoader.Builder(appCtx).build()),
                ) { placeholderBitmap(appCtx) },
            )
            .build()
        // 定死 audioSessionId：均衡器绑一次(固定 session)全程有效，无需随播放重挂
        val am = appCtx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        val sid = am?.generateAudioSessionId() ?: AudioManager.ERROR
        if (sid != AudioManager.ERROR) {
            audioSessionId = sid
            p.setAudioSessionId(sid)
        }
        appContext = appCtx
        httpFactory = OkHttpDataSource.Factory(
            OkHttpClient.Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                // 请求缺 User-Agent（无或空）时补默认 UA；插件自带 UA 优先
                .addInterceptor { chain ->
                    val req = chain.request()
                    if (req.header("User-Agent").isNullOrEmpty()) {
                        chain.proceed(
                            req.newBuilder()
                                .header("User-Agent", DEFAULT_USER_AGENT)
                                .build(),
                        )
                    } else {
                        chain.proceed(req)
                    }
                }
                .build(),
        )
    }

    /**
     * 建进程内 keep-alive controller 绑定播放服务，钉住其生命周期（幂等：已绑则跳过）。
     * 连接被拒/取消/失败 → 清代际允许重试；意外断连由 keepAliveControllerListener 自愈重绑
     */
    fun ensureServiceBound() = runOnMain {
        val appCtx = appContext ?: return@runOnMain
        if (keepAliveController != null) return@runOnMain
        keepAliveReleasing = false
        val token = SessionToken(appCtx, ComponentName(appCtx, MusicFreeAudioService::class.java))
        val future = MediaController.Builder(appCtx, token)
            .setListener(keepAliveControllerListener)
            .buildAsync()
        keepAliveController = future
        future.addListener({
            try {
                future.get() // 连接成功；controller 由 future 持有保活，无需额外操作
            } catch (e: Exception) {
                // 被拒/取消/失败：清代际，允许下次 ensureServiceBound 重试
                if (keepAliveController === future) keepAliveController = null
            }
        }, ContextCompat.getMainExecutor(appCtx))
    }

    /** 释放 keep-alive 绑定（不动 player/session）：onTaskRemoved 暂停态退出用，让 bound service 能被 stopSelf 真正销毁 */
    fun releaseKeepAliveController() = runOnMain {
        keepAliveReleasing = true
        keepAliveController?.let { MediaController.releaseFuture(it) }
        keepAliveController = null
    }

    /** 是否处于「意图播放」态(含缓冲)：供 service onTaskRemoved 判断划掉任务后是否保活；须在主线程调用 */
    fun isPlaybackActive(): Boolean {
        val p = player ?: return false
        return p.playWhenReady && p.playbackState != Player.STATE_IDLE && p.playbackState != Player.STATE_ENDED
    }

    /**
     * JS setup 传入缓存配置：开关 + 上限；SimpleCache 首次开启时创建(进程单例)，固定用 app 私有缓存目录 cacheDir/audio
     * maxBytes<=0 视为无效配置，不建缓存(退化直连)，避免 LRU(0) 写入即淘汰
     * TODO: maxBytes 首次创建时定死，运行时改容量不生效(需重启引擎)；cacheEnabled 开关可运行时切
     */
    fun configureCache(enabled: Boolean, maxBytes: Long) = runOnMain {
        cacheEnabled = enabled
        val appCtx = appContext
        if (enabled && simpleCache == null && appCtx != null && maxBytes > 0) {
            val dir = File(appCtx.cacheDir, "audio")
            simpleCache = try {
                SimpleCache(
                    dir,
                    LeastRecentlyUsedCacheEvictor(maxBytes),
                    StandaloneDatabaseProvider(appCtx),
                )
            } catch (e: Exception) {
                null // 创建抛异常(如同目录已有实例/DB 不可用) → 退化为不缓存
            }
        }
    }

    /**
     * resolver 上游：cacheable(progressive) 且缓存已建 → RoutingDataSource(http 边下边播 / 本地直读)；否则 → DefaultDataSource 直连
     * HLS/DASH 恒 cacheable=false：签名分片 URL 轮换 + ABR 码率碎片化 + 直播无限流，缓存命中率结构性为零且会污染 progressive 主池，故只走内存缓冲不落盘
     * build 时捕获缓存实例；cacheEnabled 开关由 RoutingDataSource 内部实时读
     */
    private fun upstreamFor(cacheable: Boolean): DataSource.Factory? {
        val appCtx = appContext ?: return null
        val http = httpFactory ?: return null
        val cache = simpleCache
        return if (cacheable && cache != null) {
            RoutingDataSource.Factory(appCtx, cache, http) { cacheEnabled }
        } else {
            DefaultDataSource.Factory(appCtx, http)
        }
    }

    /** 进度回调间隔，clamp 到下限；由 JS setup 设置，下一个 tick 生效。 */
    fun setProgressIntervalMs(ms: Long) = runOnMain {
        progressIntervalMs = ms.coerceAtLeast(MIN_PROGRESS_MS)
    }

    /** 只存 meta，占位 URI 惰性解析；next 非空则同时预取次曲（两槽无缝）。 */
    fun setAudio(item: SlotItem, autoPlay: Boolean, next: SlotItem?) = runOnMain {
        val p = player ?: return@runOnMain
        ensureServiceBound() // 划掉任务解绑后进程尚存时的自愈：激活播放前重新确保绑定，保证前台通知托管
        stopped = false
        errored = false
        // 快路径：传入 curr 正是已预取的 slot1（手动 next 命中预取）→ 推进已暖槽、免重解析，见 advanceToPrefetched
        // 仅当 player 处于规范态(index0=curr、且有 next) 且目标确实不同于当前曲、且 occurrence 身份一致时才走：
        // 单曲循环/streamType 纠正时 curr 与 next 同 cacheKey，不能误当「晋升预取」（否则复用旧类型预载源）；
        // slotId 不等（JS 未沿用 next 的 occurrence）也走重建，避免复用槽的 tag/resolver 仍带旧 slotId 与新账本脱节
        if (slots.size >= 2 && slots[1].cacheKey == item.cacheKey && slots[0].cacheKey != item.cacheKey &&
            slots[1].slotId == item.slotId &&
            p.currentMediaItemIndex == 0 && p.mediaItemCount >= 2
        ) {
            advanceToPrefetched(p, item, autoPlay, next)
            return@runOnMain
        }
        // 整体重建两槽：先建 curr source（不碰 slots）；不支持的 streamType 直接失败，别发布无法播的槽
        val currSource = buildMediaSource(item)
        if (currSource == null) {
            loading = false
            errored = true
            slots = emptyList()
            cancelStalePending()
            p.clearMediaItems() // 别让旧曲继续播：状态是 error，声音也要停
            listener?.onError(item, SLOT_CURRENT, ERR_UNSUPPORTED, "unsupported streamType: ${item.streamType}")
            emitState()
            return@runOnMain
        }
        loading = true
        val sources = mutableListOf(currSource)
        var nextSlot: SlotItem? = null
        if (next != null) {
            val nextSource = buildMediaSource(next)
            if (nextSource != null) {
                sources.add(nextSource)
                nextSlot = next
            } else {
                // 次曲 streamType 不支持：只播 curr，报次曲错误让 JS 换
                listener?.onError(next, SLOT_NEXT, ERR_UNSUPPORTED, "unsupported streamType: ${next.streamType}")
            }
        }
        // 先更新槽（单一真相源），再取消「已不在槽」的旧在途；同 cacheKey 仍有效的不动
        slots = listOfNotNull(item, nextSlot)
        cancelStalePending()
        p.setMediaSources(sources)
        p.prepare()
        p.playWhenReady = autoPlay
    }

    /**
     * 快路径：传入 item 命中已预取的 slot1，直接 seek 过去复用其暖缓冲，免重跑 resolver
     * 列表变化 2→2→1→1→2 全程不到 3 项、单同步块无异步窗口；SEEK 过渡被 onMediaItemTransition 忽略不动 slots
     * 不变量：先更新 slots 再 cancelStalePending；loader 线程读的 slots 全程含 matched 的 cacheKey，其在途预取解析不被误取消
     */
    private fun advanceToPrefetched(p: ExoPlayer, item: SlotItem, autoPlay: Boolean, next: SlotItem?) {
        // 动列表前先备新次曲源：不支持则报 SLOT_NEXT 错、次曲留空，不影响已推进的当前
        val nextSource = next?.let { buildMediaSource(it) }
        val nextSlot = if (next != null && nextSource == null) {
            listener?.onError(next, SLOT_NEXT, ERR_UNSUPPORTED, "unsupported streamType: ${next.streamType}")
            null
        } else next
        p.seekToNextMediaItem() // 推进到 slot1(已暖)，SEEK 过渡 handler 忽略、不动 slots
        p.removeMediaItem(0)    // 删旧 curr，当前回到 index0
        slots = listOfNotNull(item, nextSlot) // 先更新真相源
        cancelStalePending()    // 取消旧 curr 残留在途(若有)；matched/next 的 cacheKey 仍在槽、不误取消
        // 用传入 item 的最新 meta 刷新当前(占位 URI 同 cacheKey 不变 → 仅改 metadata 不重缓冲)
        p.currentMediaItem?.let { cur ->
            p.replaceMediaItem(
                0,
                cur.buildUpon().setMediaMetadata(buildMeta(item.title, item.artist, item.artwork)).build(),
            )
        }
        nextSource?.let { p.addMediaSource(it) } // 挂新次曲槽
        // stop() / 播放出错后 player 停在 IDLE 且保留列表，此时快路径条件照样成立；IDLE 下只改 playWhenReady
        // 不会出声（与 play() 的 IDLE 分支同理），JS 账本却已切到新曲——补一次 prepare 才真的推进。
        // loading 要在 prepare 之前置好：prepare 会同步回调 STATE_BUFFERING → emitState，晚置会先漏发一次 buffering
        if (p.playbackState == Player.STATE_IDLE) {
            loading = true
            p.prepare()
        } else {
            loading = p.playbackState != Player.STATE_READY
        }
        p.playWhenReady = autoPlay
        emitState()
    }

    /** 设/清次曲槽；相对 currentMediaItemIndex 维护 next（不依赖绝对 index，容忍未 trim 的已播项）。 */
    fun setNext(next: SlotItem?) = runOnMain {
        val p = player ?: return@runOnMain
        val curr = slots.firstOrNull() ?: return@runOnMain // 无 curr 不预取
        val nextSource = next?.let { buildMediaSource(it) }
        if (next != null && nextSource == null) {
            // 次曲不支持：清掉 next 槽并报错
            slots = listOf(curr)
            cancelStalePending()
            removeMediaItemsAfterCurrent(p)
            listener?.onError(next, SLOT_NEXT, ERR_UNSUPPORTED, "unsupported streamType: ${next.streamType}")
            return@runOnMain
        }
        slots = listOfNotNull(curr, next)
        cancelStalePending()
        removeMediaItemsAfterCurrent(p)
        nextSource?.let { p.addMediaSource(it) }
    }

    fun play() = runOnMain {
        val p = player ?: return@runOnMain
        ensureServiceBound() // 划掉任务解绑后进程尚存时的自愈：播放前重新确保绑定，保证前台通知托管
        stopped = false
        when (p.playbackState) {
            // stop() 后回到 IDLE，需重新 prepare 才能出声
            Player.STATE_IDLE -> if (p.currentMediaItem != null) {
                errored = false
                loading = true
                p.prepare()
                p.play()
            }
            // 自然播完停在 ENDED，回到起点再播
            Player.STATE_ENDED -> {
                p.seekTo(0)
                p.play()
            }
            else -> p.play()
        }
    }

    fun pause() = runOnMain { player?.pause() }

    fun stop() = runOnMain {
        val p = player ?: return@runOnMain
        stopped = true
        errored = false
        loading = false
        p.stop()
        p.seekTo(0)
        emitState()
    }

    fun seekTo(seconds: Double) = runOnMain {
        if (!seconds.isFinite()) return@runOnMain
        player?.seekTo((seconds * 1000).toLong().coerceAtLeast(0L))
    }

    fun setRate(rate: Float) = runOnMain {
        val safe = if (rate.isFinite() && rate > 0f) rate else 1f
        player?.playbackParameters = PlaybackParameters(safe)
    }

    fun setVolume(volume: Float) = runOnMain {
        if (!volume.isFinite()) return@runOnMain
        player?.volume = volume.coerceIn(0f, 1f)
    }

    fun setMixWithOthers(enabled: Boolean) = runOnMain {
        val currentPlayer = player ?: return@runOnMain
        currentPlayer.setAudioAttributes(currentPlayer.audioAttributes, !enabled)
    }

    fun reset() = runOnMain {
        val p = player ?: return@runOnMain
        stopped = false
        errored = false
        loading = false
        slots = emptyList()
        cancelStalePending()
        p.clearMediaItems()
        emitState()
    }

    /** JS resolver 回填；source=null 或 requestId 对不上(stale/已取消)则该次解析失败；首个结果胜出。 */
    fun provideSource(requestId: Int, url: String?, headers: Map<String, String>) {
        val handle = pending[requestId] ?: return
        if (!handle.completed.compareAndSet(false, true)) return
        if (url != null) handle.result = ResolvedSource(url, headers.toMap()) // 不可变快照，供后续分片安全复用
        handle.latch.countDown()
    }

    /** 只改当前 item 的展示 metadata（title/artist/artwork），不动身份。 */
    fun updateMeta(platform: String?, id: String?, title: String?, artist: String?, artwork: String?) = runOnMain {
        val p = player ?: return@runOnMain
        val cur = p.currentMediaItem ?: return@runOnMain
        // 身份校验：传入 platform+id 与当前曲不一致(已切走)则丢弃，避免把旧曲 meta 贴到新曲通知
        val current = slots.firstOrNull() ?: return@runOnMain
        if (platform != current.platform || id != current.id) return@runOnMain
        val next = cur.buildUpon().setMediaMetadata(buildMeta(title, artist, artwork)).build()
        p.replaceMediaItem(p.currentMediaItemIndex, next)
    }

    fun getProgress(cb: (Double, Double, Double) -> Unit) = runOnMain {
        val p = player
        if (p == null) cb(0.0, 0.0, 0.0)
        else cb(msToSec(p.currentPosition), msToSec(p.duration), msToSec(p.bufferedPosition))
    }

    fun getState(cb: (String) -> Unit) = runOnMain { cb(currentState()) }

    fun getRate(cb: (Float) -> Unit) = runOnMain { cb(player?.playbackParameters?.speed ?: 1f) }

    fun release() = runOnMain {
        mainHandler.removeCallbacks(progressRunnable)
        ticking = false
        slots = emptyList()
        cancelStalePending()
        keepAliveReleasing = true
        keepAliveController?.let { MediaController.releaseFuture(it) }
        keepAliveController = null
        session?.release()
        session = null
        player?.release()
        player = null
        equalizer?.release()
        equalizer = null
        simpleCache?.release()
        simpleCache = null
    }

    /**
     * 缓存已用字节。先 runOnMain 串到主线程队列(排在 configureCache 之后，避免刚 setup 完 simpleCache 还没建就读到 0)，
     * 再交后台线程读(与 clear/remove 串行，避免 cache 初始化/释放竞争)；异常返 0 保证 Promise 落地。
     */
    fun getCacheSize(cb: (Double) -> Unit) = runOnMain {
        cacheExecutor.execute {
            val size = try {
                simpleCache?.cacheSpace ?: 0L
            } catch (_: Exception) {
                0L
            }
            cb(size.toDouble())
        }
    }

    /** 清空所有缓存。先 runOnMain 串在 configureCache 之后，再后台线程删(removeResource 可能慢)； best-effort：正在写入的 key 可能被锁而跳过。无论如何 cb 必回。 */
    fun clearCache(cb: () -> Unit) = runOnMain {
        val ctx = appContext
        cacheExecutor.execute {
            try {
                simpleCache?.let { c ->
                    HashSet(c.keys).forEach { k ->
                        try {
                            c.removeResource(k)
                        } catch (_: Exception) {
                        }
                    }
                }
                // 顺带清掉内嵌封面缓存。它不计入上面的 getCacheSize：那个数字对应用户设的音频缓存上限，
                // 封面目录有自己的 32 MiB 封顶、不受那个上限管，折进去会让「已用」稳定超出「上限」
                ctx?.let { embeddedArtworkDir(it).listFiles()?.forEach { f -> f.delete() } }
            } catch (_: Exception) {
            } finally {
                cb()
            }
        }
    }

    /**
     * 移除某 cacheKey 的缓存（progressive-only）。先 runOnMain 串在 configureCache 之后，再后台线程删(best-effort)；无论如何 cb 必回。
     * 注意：HLS/DASH 不落盘缓存（见 upstreamFor），无需清理。
     */
    fun removeCache(cacheKey: String, cb: () -> Unit) = runOnMain {
        cacheExecutor.execute {
            try {
                simpleCache?.removeResource(cacheKey)
            } catch (_: Exception) {
            } finally {
                cb()
            }
        }
    }

    /** 均衡器频段快照(对应 JS EqBand)：centerFreq 已转 Hz，增益单位 millibel。 */
    data class EqBand(
        val index: Int,
        val centerFreq: Int,
        val gain: Int,
        val minGain: Int,
        val maxGain: Int,
    )

    /** 惰性建均衡器(绑固定 session)；构造真失败才 sticky 记 eqUnavailable降级。 */
    private fun ensureEqualizer(): Equalizer? {
        equalizer?.let { return it }
        if (eqUnavailable) return null
        // UNSET = 尚未 init 或 generateAudioSessionId 失败(无 session)：暂不可用但不 sticky，
        // 免得「init 前误调一次 eq」把之后 init 成功也永久降级掉
        if (audioSessionId == AudioManager.ERROR || audioSessionId == C.AUDIO_SESSION_ID_UNSET) {
            return null
        }
        var eq: Equalizer? = null
        return try {
            eq = Equalizer(0, audioSessionId)
            eq.enabled = eqEnabled
            equalizer = eq
            eq
        } catch (e: Exception) {
            try {
                eq?.release() // 构造成功但后续设置抛异常：释放已建 effect 免泄漏
            } catch (_: Exception) {
            }
            eqUnavailable = true // 本机无均衡器(UnsupportedOperationException 等) → sticky 降级
            null
        }
    }

    /** 读所有频段；不支持返空(JS 据此隐藏 EQ 入口)。 */
    fun eqGetBands(cb: (List<EqBand>) -> Unit) = runOnMain {
        val eq = ensureEqualizer()
        if (eq == null) {
            cb(emptyList())
            return@runOnMain
        }
        val bands = try {
            val range = eq.bandLevelRange // short[2] {min,max} mB
            val min = range[0].toInt()
            val max = range[1].toInt()
            (0 until eq.numberOfBands.toInt()).map { i ->
                val b = i.toShort()
                EqBand(
                    index = i,
                    centerFreq = eq.getCenterFreq(b) / 1000, // milliHz → Hz
                    gain = eq.getBandLevel(b).toInt(),
                    minGain = min,
                    maxGain = max,
                )
            }
        } catch (e: Exception) {
            emptyList()
        }
        cb(bands)
    }

    /** 设某频段增益(millibel)；校验 index 合法、按设备范围 clamp 增益(免 toShort 回绕)；不支持/非法静默 no-op。 */
    fun eqSetBandGain(index: Int, millibel: Int, cb: () -> Unit) = runOnMain {
        val eq = ensureEqualizer()
        if (eq != null) {
            try {
                if (index in 0 until eq.numberOfBands.toInt()) {
                    val range = eq.bandLevelRange // short[2] {min,max} mB
                    val clamped = millibel.coerceIn(range[0].toInt(), range[1].toInt())
                    eq.setBandLevel(index.toShort(), clamped.toShort())
                }
            } catch (_: Exception) {
            }
        }
        cb()
    }

    /** 开关均衡器；记 eqEnabled 供(重)建时套用；不支持静默 no-op。 */
    fun eqSetEnabled(enabled: Boolean, cb: () -> Unit) = runOnMain {
        eqEnabled = enabled
        try {
            ensureEqualizer()?.enabled = enabled
        } catch (_: Exception) {
        }
        cb()
    }

    /** 内置预设名列表；不支持返空。 */
    fun eqGetPresets(cb: (List<String>) -> Unit) = runOnMain {
        val eq = ensureEqualizer()
        if (eq == null) {
            cb(emptyList())
            return@runOnMain
        }
        val presets = try {
            (0 until eq.numberOfPresets.toInt()).map { eq.getPresetName(it.toShort()) }
        } catch (e: Exception) {
            emptyList()
        }
        cb(presets)
    }

    /** 套用预设(按名字找序号)；名字不存在或不支持静默 no-op。 */
    fun eqUsePreset(name: String, cb: () -> Unit) = runOnMain {
        val eq = ensureEqualizer()
        if (eq == null) {
            cb()
            return@runOnMain
        }
        try {
            val idx = (0 until eq.numberOfPresets.toInt())
                .firstOrNull { eq.getPresetName(it.toShort()) == name }
            if (idx != null) eq.usePreset(idx.toShort())
        } catch (_: Exception) {
        }
        cb()
    }

    private val playerListener = object : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) {
            if (playbackState == Player.STATE_READY) loading = false
            // 队列到底（无 next 可 AUTO 过渡）：最后一首自然播完也发 onAudioEnd（promoted=null），与 iOS/AUTO 路径对齐
            // 与 AUTO 互斥：有 next 才 AUTO 过渡、无 next 才进 ENDED；每次自然到底=一次 ENDED，不重复
            if (playbackState == Player.STATE_ENDED) {
                slots.firstOrNull()?.let { listener?.onAudioEnd(it, null) }
            }
            emitState()
        }
        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) = emitState()
        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            // 只在自然过渡(AUTO)发 onAudioEnd；主动 setAudio/setNext 不发
            if (reason != Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) return
            val ended = slots.firstOrNull()
            slots = slots.drop(1) // curr 播完，next 成为新 curr
            val promoted = slots.firstOrNull() // 引擎无缝晋升的新当前曲
            // 新 current 未预热到 READY 则视为该曲首次加载(loading)，已就绪则无缝
            loading = player?.playbackState != Player.STATE_READY
            // 移除已播项恢复 index0=curr；post 避免在过渡回调里重入改列表
            mainHandler.post { player?.let { removeMediaItemsBeforeCurrent(it) } }
            ended?.let { listener?.onAudioEnd(it, promoted) }
            maybeEmitStarted() // 无缝续播：新 current 已在出声（isPlaying 无新边沿），补发 started
            emitState()
        }
        override fun onMediaMetadataChanged(mediaMetadata: MediaMetadata) {
            // 合并元数据里带了码流自身的封面（ID3 APIC / FLAC PICTURE）：JS 侧只认 URL，落成缓存文件后回传。
            // 通知栏走 DataSourceBitmapLoader 本就能画出这份封面，这里是让 App 内的播放页也用得上
            val data = mediaMetadata.artworkData ?: return
            val cur = slots.firstOrNull() ?: return
            if (!cur.extractEmbeddedArtwork || !cur.artwork.isNullOrBlank() || cur.slotId == embeddedArtworkSlotId) return
            val tag = player?.currentMediaItem?.localConfiguration?.tag as? Long
            if (tag != cur.slotId) return
            val ctx = appContext ?: return
            // 提前落闩（而不是写盘成功后）：updateMeta 换 MediaItem 元数据会同步再触发本回调，晚落闩就会排进第二个写任务；
            // 代价是写盘失败时本次 load 不再重试，下一次 load 重来
            embeddedArtworkSlotId = cur.slotId
            cacheExecutor.execute {
                // best-effort 的封面缓存不能有杀掉播放进程的能力：任务体整体兜住，与本文件其它 executor 任务一致
                val uri = try {
                    writeEmbeddedArtwork(ctx, data)
                } catch (_: Exception) {
                    null
                } ?: return@execute
                mainHandler.post {
                    // 落盘期间可能已切歌：只对仍在当前槽的那次 load 回传
                    if (slots.firstOrNull()?.slotId == cur.slotId) listener?.onEmbeddedArtwork(cur, uri)
                }
            }
        }
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (isPlaying) {
                tailUntilMs = Long.MAX_VALUE
                startTicking()
                maybeEmitStarted() // 首次出声/暂停后恢复：按 slotId 去重，仅新 load 发 started
            } else {
                // 暂停/停止后再拖 PROGRESS_TAIL_MS，把最后位置 flush 出去，UI 不停在旧值
                tailUntilMs = SystemClock.uptimeMillis() + PROGRESS_TAIL_MS
            }
            // 焦点抑制等会翻转 isPlaying 但不改 playbackState，这里同步一次状态
            emitState()
        }
        override fun onPositionDiscontinuity(
            oldPosition: Player.PositionInfo,
            newPosition: Player.PositionInfo,
            reason: Int,
        ) {
            // 暂停时 seek ticker 不在跑，补发一次让 UI 位置跟上（含通知/媒体中心 seek、seek 校正）
            if (reason == Player.DISCONTINUITY_REASON_SEEK ||
                reason == Player.DISCONTINUITY_REASON_SEEK_ADJUSTMENT
            ) {
                player?.let { emitProgress(it) }
            }
        }
        override fun onPlayerError(error: PlaybackException) {
            // 顺 cause 链：区分取消(忽略) / resolve 真失败(E_RESOLVE，带失败 load 的 slotId) / 其余；并取最具体的细节 message
            var isCancel = false
            var isResolve = false
            var resolveMsg: String? = null
            var resolveItem: SlotItem? = null
            var deepestMsg: String? = error.message
            var cause: Throwable? = error
            while (cause != null) {
                when (cause) {
                    is CancelledResolveException -> isCancel = true
                    is ResolveException -> {
                        isResolve = true
                        resolveMsg = cause.message
                        resolveItem = cause.item
                    }
                }
                cause.message?.let { deepestMsg = it }
                cause = cause.cause
            }
            // 换源/取消导致的 stale load 错，不算用户错误（后续 prepare 会恢复）
            if (isCancel) return
            errored = true
            loading = false
            // 归属到「失败那次 load」：resolve 错用 exception 里的快照（即使已不在 live 槽）；播放错用当前媒体项 tag 定位
            val failedSlot: SlotItem? = if (isResolve) {
                resolveItem
            } else {
                val tag = player?.currentMediaItem?.localConfiguration?.tag as? Long
                slots.firstOrNull { it.slotId == tag } ?: slots.firstOrNull()
            }
            // 标签按 slotId 匹配当前槽定（JS 仍以 slotId 为权威归属，此标签为辅助）
            val slotLabel =
                if (failedSlot != null && failedSlot.slotId == slots.firstOrNull()?.slotId) SLOT_CURRENT else SLOT_NEXT
            val code = if (isResolve) ERR_RESOLVE else bucketErrorCode(error.errorCode)
            val detail = resolveMsg ?: deepestMsg ?: "playback error"
            listener?.onError(failedSlot, slotLabel, code, "${error.errorCodeName}: $detail")
            emitState()
        }
    }

    // 无封面占位（通知/锁屏）：色值对齐 app 内 surfaceVariant / textSecondary，随系统深浅
    private val placeholderSize = 512
    private val placeholderGlyph = 236 // 居中约 46%
    private val placeholderBgLight = 0xFFF2F2F2.toInt()
    private val placeholderBgDark = 0xFF303030.toInt()
    private val placeholderFgLight = 0xFF666666.toInt()
    private val placeholderFgDark = 0xFFAAAAAA.toInt()
    private var placeholderCache: Pair<Boolean, Bitmap>? = null

    private fun buildMeta(title: String?, artist: String?, artwork: String?): MediaMetadata =
        MediaMetadata.Builder()
            .setTitle(title)
            .setArtist(artist)
            .apply { if (!artwork.isNullOrBlank()) setArtworkUri(Uri.parse(artwork)) }
            .build()

    /** 无封面 / 封面加载失败时的通知占位：中性底 + 居中 disc-3，随系统深浅；512² Bitmap，按主题缓存 */
    @Synchronized
    private fun placeholderBitmap(ctx: Context): Bitmap {
        val night = (ctx.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES
        placeholderCache?.let { if (it.first == night) return it.second }
        val bg = if (night) placeholderBgDark else placeholderBgLight
        val fg = if (night) placeholderFgDark else placeholderFgLight
        val bitmap = Bitmap.createBitmap(placeholderSize, placeholderSize, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(bg)
        ContextCompat.getDrawable(ctx, R.drawable.ic_media_placeholder)?.let { glyph ->
            val inset = (placeholderSize - placeholderGlyph) / 2
            glyph.setBounds(inset, inset, placeholderSize - inset, placeholderSize - inset)
            glyph.setTint(fg)
            glyph.draw(canvas)
        }
        placeholderCache = night to bitmap
        return bitmap
    }

    /**
     * 把内嵌封面字节写进 cacheDir/embeddedArtwork，按内容哈希命名（同一张封面多首歌共用一份）；返回 file:// 地址，失败返 null
     * 目录按字节封顶、删最久未用的：内嵌封面一首一张、几十 KB 到几 MB，不能无限攒；命中时刷 mtime，淘汰才是真 LRU
     */
    private fun writeEmbeddedArtwork(ctx: Context, data: ByteArray): String? {
        val dir = embeddedArtworkDir(ctx).apply { mkdirs() }
        val digest = MessageDigest.getInstance("MD5").digest(data)
        val name = digest.joinToString("") { "%02x".format(it) } + artworkExtension(data)
        val file = File(dir, name)
        if (file.exists()) {
            file.setLastModified(System.currentTimeMillis())
            // 命中也扫一次：过期 .part 的清理不能只靠「下一次成功写入」触发
            pruneEmbeddedArtwork(dir, keep = file)
            return Uri.fromFile(file).toString()
        }
        val tmp = File(dir, "$name.part")
        try {
            tmp.writeBytes(data)
            if (!tmp.renameTo(file)) return null
        } catch (_: Exception) {
            return null
        } finally {
            // 写一半 / 改名失败的残片都清掉，别让它们绕过封顶永久堆着
            if (tmp.exists()) tmp.delete()
        }
        pruneEmbeddedArtwork(dir, keep = file)
        return Uri.fromFile(file).toString()
    }

    /** 按魔数定后缀，图片解码器不认后缀也无妨，只是让缓存目录里的文件能被人认出来 */
    private fun artworkExtension(data: ByteArray): String = when {
        data.size >= 3 && data[0] == 0xFF.toByte() && data[1] == 0xD8.toByte() && data[2] == 0xFF.toByte() -> ".jpg"
        data.size >= 4 && data[0] == 0x89.toByte() && data[1] == 0x50.toByte() && data[2] == 0x4E.toByte() && data[3] == 0x47.toByte() -> ".png"
        else -> ".img"
    }

    /** 超过字节上限则从最久未用的开始删（刚写出的那张不删）；顺手清掉上次进程中断留下的过期 .part */
    private fun pruneEmbeddedArtwork(dir: File, keep: File) {
        val files = dir.listFiles { f -> f.isFile } ?: return
        val staleBefore = System.currentTimeMillis() - EMBEDDED_ARTWORK_PART_TTL_MS
        files.filter { it.name.endsWith(".part") && it.lastModified() < staleBefore }.forEach { it.delete() }
        val images = files.filter { !it.name.endsWith(".part") && it != keep }.sortedBy { it.lastModified() }
        var total = files.filter { !it.name.endsWith(".part") }.sumOf { it.length() }
        for (f in images) {
            if (total <= EMBEDDED_ARTWORK_MAX_BYTES) break
            val len = f.length()
            if (f.delete()) total -= len
        }
    }

    private fun embeddedArtworkDir(ctx: Context) = File(ctx.cacheDir, EMBEDDED_ARTWORK_DIR)

    /** 把 ExoPlayer errorCode 归桶到稳定错误码（Media3 分段：2xxx=IO，3xxx=解析，4xxx=解码，其余不细分）。 */
    private fun bucketErrorCode(errorCode: Int): String = when (errorCode) {
        in 2000..2999 -> ERR_SOURCE
        in 3000..4999 -> ERR_DECODE
        else -> ERR_UNKNOWN
    }

    /** 移除当前项之后的所有项（旧 next / 残留），保持 next 槽唯一；从末尾删避免影响当前 index。 */
    private fun removeMediaItemsAfterCurrent(p: ExoPlayer) {
        while (p.mediaItemCount > p.currentMediaItemIndex + 1) {
            p.removeMediaItem(p.mediaItemCount - 1)
        }
    }

    /** 移除当前项之前的所有项（AUTO 过渡后的已播残留），使当前回到 index0。 */
    private fun removeMediaItemsBeforeCurrent(p: ExoPlayer) {
        while (p.currentMediaItemIndex > 0) p.removeMediaItem(0)
    }

    /**
     * 解析阶段的失败不由 ExoPlayer 重试：默认策略会对 IOException 反复重试（延迟 0 / 1s / 2s…），
     * 而 ResolveException 每重试一次就回 JS 重跑整条解析链——JS 解析器报失败时已经在内部做完音质回退与插件重试，
     * 原生再重试只是重跑同一条注定失败的链，坏源会被放大成一秒几十个请求。节奏交给 JS 侧的跳歌退避。
     * 真实 URL 上的网络抖动不经过 resolver、不抛这两个异常，仍走默认策略
     */
    private val loadErrorPolicy = object : DefaultLoadErrorHandlingPolicy() {
        override fun getRetryDelayMsFor(loadErrorInfo: LoadErrorHandlingPolicy.LoadErrorInfo): Long {
            var cause: Throwable? = loadErrorInfo.exception
            while (cause != null) {
                if (cause is ResolveException || cause is CancelledResolveException) return C.TIME_UNSET
                cause = cause.cause
            }
            return super.getRetryDelayMsFor(loadErrorInfo)
        }
    }

    private fun buildMediaSource(item: SlotItem): MediaSource? {
        // progressive 走缓存上游；hls/dash 不落盘、只内存缓冲（见 upstreamFor）
        val cacheable = item.streamType == null || item.streamType == "progressive"
        // 每个 item 造自己的 resolving 工厂：per-item resolver 记住本源解析出的 headers，供其 HLS/DASH 分片同 host 复用
        val upstream = upstreamFor(cacheable) ?: return null
        val resolving = ResolvingDataSource.Factory(upstream, buildResolver(item.cacheKey, item.slotId))
        val placeholder = MediaItem.Builder()
            .setUri("$PLACEHOLDER_PREFIX${Uri.encode(item.cacheKey)}")
            .setTag(item.slotId) // 绑定 load occurrence 号，onError/currentMediaItem 按它精确归属
            .setMediaMetadata(buildMeta(item.title, item.artist, item.artwork))
        // 类型不靠 URI 推断（占位 URI 无扩展名），按 streamType 显式选工厂，都包同一 resolving
        return when (item.streamType) {
            null, "progressive" ->
                // progressive 单文件：整首归一个稳定 cacheKey（不按易变 resolved URL），作 customCacheKey 喂 SimpleCache
                ProgressiveMediaSource.Factory(resolving)
                    .setLoadErrorHandlingPolicy(loadErrorPolicy)
                    .createMediaSource(placeholder.setCustomCacheKey(item.cacheKey).build())
            "hls" ->
                // HLS：占位 URI 解析一次拿到真实 .m3u8（resolver 用其 getUri 的已解析地址作分片相对基址）；
                // 不落盘缓存，分片经 resolver 放行只做同 host header 隔离
                HlsMediaSource.Factory(resolving)
                    .setLoadErrorHandlingPolicy(loadErrorPolicy)
                    .createMediaSource(placeholder.build())
            "dash" ->
                DashMediaSource.Factory(resolving)
                    .setLoadErrorHandlingPolicy(loadErrorPolicy)
                    .createMediaSource(placeholder.build())
            else -> null
        }
    }

    /**
     * 每个 item 一个 resolver（loader 线程跑）：
     * - 占位 URI → resolvePlaceholder(cacheKey) 拿真实 url+headers，改写 dataSpec，并记下(清单 host, headers)；
     * - 真实 URL（HLS/DASH 分片/AES key/init 段…）→ 仅当与清单同 host 才套 headers（防凭证外泄给清单引用的第三方 host），否则裸放行。
     * headers 住在闭包私有 AtomicReference（跨 loader 线程可见），随该 MediaSource 生死回收，两槽零串扰。
     */
    private fun buildResolver(cacheKey: String, slotId: Long): ResolvingDataSource.Resolver {
        val scopedHeaders = AtomicReference<Pair<String?, Map<String, String>>?>(null)
        return ResolvingDataSource.Resolver { dataSpec ->
            if (dataSpec.uri.scheme != PLACEHOLDER_SCHEME) {
                val scope = scopedHeaders.get()
                // host 大小写不敏感：存/比都归一到小写，免得 CDN.x.com 与 cdn.x.com 误判跨 host
                val segHost = dataSpec.uri.host?.lowercase(Locale.ROOT)
                val base = if (scope?.first != null && scope.first == segHost) {
                    scope.second // 同 host 分片：套本源 headers
                } else {
                    emptyMap() // 跨 host / 未解析：裸放行，不外泄凭证
                }
                return@Resolver if (base.isEmpty()) {
                    dataSpec
                } else {
                    dataSpec.buildUpon()
                        .setHttpRequestHeaders(mergeHeaders(base, dataSpec.httpRequestHeaders))
                        .build()
                }
            }
            val resolved = resolvePlaceholder(cacheKey, slotId)
            val resolvedUri = Uri.parse(resolved.url)
            // 记清单 host(小写)+headers，供同 host 分片复用
            scopedHeaders.set(resolvedUri.host?.lowercase(Locale.ROOT) to resolved.headers)
            dataSpec.buildUpon()
                .setUri(resolvedUri)
                .setHttpRequestHeaders(mergeHeaders(resolved.headers, dataSpec.httpRequestHeaders))
                .build()
        }
    }

    /** item headers 作 base，dataSpec 自带 headers 覆盖（一般为空）。 */
    private fun mergeHeaders(
        base: Map<String, String>,
        override: Map<String, String>,
    ): Map<String, String> =
        if (override.isEmpty()) base else if (base.isEmpty()) override else base + override

    /** 占位 URI 解析躯干：查槽 → 登记 pending → onResolveSource → latch 阻塞等回填 → 三处 stale 检查。抛异常=失败/取消。 */
    private fun resolvePlaceholder(cacheKey: String, slotId: Long): ResolvedSource {
        // 优先按 slotId 定位本次 load 的槽（current/next 同 cacheKey 时不取错槽）；cacheKey 作 stale fallback
        // 回带本次 load 的 slotId（非 live 槽的），供 JS 按 occurrence 判 stale
        val item = (slots.firstOrNull { it.slotId == slotId } ?: slots.find { it.cacheKey == cacheKey })
            ?.copy(slotId = slotId)
            ?: throw CancelledResolveException("resolve: unknown slot $cacheKey")
        val callback = listener ?: throw ResolveException("resolve: no listener", item)
        val requestId = requestSeq.incrementAndGet()
        val handle = PendingResolve(cacheKey)
        pending[requestId] = handle
        // 登记后立即自查：cacheKey 已不在任何槽（换成别的歌/清空）→ 作废，挡擦肩登记竞态（slots 在 cancelStalePending 前已更新）
        if (slots.none { it.cacheKey == cacheKey }) {
            pending.remove(requestId)
            throw CancelledResolveException("resolve superseded: $cacheKey")
        }
        try {
            callback.onResolveSource(requestId, item)
            if (!handle.latch.await(RESOLVE_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
                throw ResolveException("resolve timeout: $cacheKey", item)
            }
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            // 线程中断 = ExoPlayer 取消了这次 load（换源/释放），归取消；不能用泛化 InterruptedIOException（SocketTimeoutException 继承它）
            throw CancelledResolveException("resolve interrupted: $cacheKey")
        } finally {
            pending.remove(requestId)
        }
        // 醒来后再查：cacheKey 已不在任何槽 → 不拿 stale 结果回填已废弃的 load
        if (slots.none { it.cacheKey == cacheKey }) {
            throw CancelledResolveException("resolve cancelled: $cacheKey")
        }
        return handle.result ?: throw ResolveException("resolve failed: $cacheKey", item)
    }

    /** 唤醒并移除「cacheKey 已不在任何槽」的在途解析（换歌/清空后）；同 cacheKey 仍有效的保留，别误取消。精确 remove(id,handle) 避免删掉有效句柄。 */
    private fun cancelStalePending() {
        for ((id, handle) in pending) {
            if (slots.none { it.cacheKey == handle.cacheKey }) {
                if (pending.remove(id, handle)) handle.latch.countDown()
            }
        }
    }

    /** 当前槽首次真正出声时发一次 onStarted（按 slotId 去重：resume/同 load 不重发；晋升无缝续播由 onMediaItemTransition 触发）。 */
    private fun maybeEmitStarted() {
        if (player?.isPlaying != true) return
        val cur = slots.firstOrNull() ?: return
        if (cur.slotId == startedSlotId) return
        startedSlotId = cur.slotId
        listener?.onStarted(cur)
    }

    private fun emitState() {
        val s = currentState()
        if (s == lastState) return
        lastState = s
        listener?.onStateChanged(s)    }

    private fun currentState(): String {
        val p = player ?: return "idle"
        if (errored) return "error"
        if (p.mediaItemCount == 0) return "idle"
        return when (p.playbackState) {
            Player.STATE_IDLE -> if (stopped) "stopped" else "idle"
            Player.STATE_BUFFERING -> if (loading) "loading" else "buffering"
            Player.STATE_READY -> if (p.isPlaying) "playing" else "paused"
            Player.STATE_ENDED -> "stopped"
            else -> "idle"
        }
    }

    private val progressRunnable = object : Runnable {
        override fun run() {
            val p = player
            if (p == null) {
                ticking = false
                return
            }
            emitProgress(p)
            if (p.isPlaying || SystemClock.uptimeMillis() < tailUntilMs) {
                mainHandler.postDelayed(this, progressIntervalMs)
            } else {
                ticking = false
            }
        }
    }

    /** 只在未跑时启动，避免重复排队。 */
    private fun startTicking() {
        if (ticking) return
        ticking = true
        mainHandler.post(progressRunnable)
    }

    private fun emitProgress(p: ExoPlayer) {
        // 原子快照：进度值与 slotId 均从同一 currentMediaItem 采样；无有效 slotId（过渡 / 空槽 / -1 哨兵）时不发送，
        // 不使用旧样本填充 live 槽身份，JS 通过 slotId 丢弃切歌时迟到的 tick
        val slotId = (p.currentMediaItem?.localConfiguration?.tag as? Long)?.takeIf { it > 0L } ?: return
        val sample = ProgressSample(
            positionSec = msToSec(p.currentPosition),
            durationSec = msToSec(p.duration),
            bufferedSec = msToSec(p.bufferedPosition),
            slotId = slotId,
        )
        progressMailbox.offer(sample)?.let(::emitProgressDelivery)
    }

    private fun emitProgressDelivery(delivery: LatestOnlyMailbox.Delivery<ProgressSample>) {
        val currentListener = listener
        if (currentListener == null) {
            progressMailbox.reset()
            return
        }
        val sample = delivery.value
        currentListener.onProgress(
            delivery.id,
            sample.positionSec,
            sample.durationSec,
            sample.bufferedSec,
            sample.slotId,
        )
    }

    private fun msToSec(ms: Long): Double = if (ms == C.TIME_UNSET) 0.0 else ms / 1000.0

    private fun runOnMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block() else mainHandler.post(block)
    }

    private const val DEFAULT_PROGRESS_MS = 500L
    private const val MIN_PROGRESS_MS = 100L
    private const val PROGRESS_TAIL_MS = 1000L
    private const val RESOLVE_TIMEOUT_MS = 25_000L
    // 缺省浏览器式 UA，规避部分源对默认客户端 UA 的拦截
    private const val DEFAULT_USER_AGENT =
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    private const val PLACEHOLDER_SCHEME = "musicfree"
    private const val PLACEHOLDER_PREFIX = "musicfree://resolve/"
    /** 内嵌封面缓存目录（cacheDir 下，与第三方库共用 cacheDir 故名字要具体）、字节上限、残片视为过期的时限 */
    private const val EMBEDDED_ARTWORK_DIR = "embeddedArtwork"
    private const val EMBEDDED_ARTWORK_MAX_BYTES = 32L * 1024 * 1024
    private const val EMBEDDED_ARTWORK_PART_TTL_MS = 60_000L

    private const val SLOT_CURRENT = "current"
    private const val SLOT_NEXT = "next"
    // 错误码（对应 src/native 的 AudioErrorCode；细节见 message）
    private const val ERR_UNSUPPORTED = "E_UNSUPPORTED"
    private const val ERR_RESOLVE = "E_RESOLVE"
    private const val ERR_SOURCE = "E_SOURCE"
    private const val ERR_DECODE = "E_DECODE"
    private const val ERR_UNKNOWN = "E_UNKNOWN"
}

/**
 * 包住真实 BitmapLoader：无封面 / 封面加载失败（过期、404 等）都回退到占位，
 * 让通知/锁屏与 app 内 MediaCover 一样「空状态由渲染方兜」。
 */
@OptIn(UnstableApi::class)
private class FallbackBitmapLoader(
    private val delegate: BitmapLoader,
    private val placeholder: () -> Bitmap,
) : BitmapLoader by delegate {
    override fun loadBitmapFromMetadata(metadata: MediaMetadata): ListenableFuture<Bitmap> {
        // 无封面地址 / 数据 → 直接占位；有则拉，失败（过期、404 等）再回退占位
        val loaded = delegate.loadBitmapFromMetadata(metadata)
            ?: return Futures.immediateFuture(placeholder())
        // 只兜 Exception（放行 OOM 等 Error）；取消保持取消，不伪装成占位
        return Futures.catchingAsync(
            loaded,
            Exception::class.java,
            { error ->
                if (error is CancellationException) {
                    Futures.immediateCancelledFuture()
                } else {
                    Futures.immediateFuture(placeholder())
                }
            },
            MoreExecutors.directExecutor(),
        )
    }
}
