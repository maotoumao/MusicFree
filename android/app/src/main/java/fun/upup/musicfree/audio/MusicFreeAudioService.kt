package `fun`.upup.musicfree.audio

import android.content.Intent
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import `fun`.upup.musicfree.R

/** 前台播放服务，宿主进程级 AudioEngine 的 MediaSession，保活进程与 JS runtime。 */
class MusicFreeAudioService : MediaSessionService() {

    @OptIn(UnstableApi::class)
    override fun onCreate() {
        super.onCreate()
        AudioEngine.init(applicationContext)
        // 自定义通知 provider：重排自定义按钮 + 渠道名「正在播放」+ 应用单色小图标（系统只取 alpha 通道）
        val provider = MusicFreeNotificationProvider(this)
        provider.setSmallIcon(R.drawable.ic_notification)
        setMediaNotificationProvider(provider)
        // JS 直驱引擎，服务生命周期由 AudioEngine 建的进程内 keep-alive controller 绑定钉住；这里显式 addSession 让服务托管通知/前台
        AudioEngine.mediaSession?.let { if (!isSessionAdded(it)) addSession(it) }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? =
        AudioEngine.mediaSession

    // 划掉最近任务：播放中(含缓冲)继续后台播放；未在播放则解绑 keep-alive 让 bound service 能被销毁 → 停服务撤通知（对齐改动前「划掉即退出」）
    override fun onTaskRemoved(rootIntent: Intent?) {
        if (AudioEngine.isPlaybackActive()) return
        AudioEngine.releaseKeepAliveController()
        super.onTaskRemoved(rootIntent)
    }

    // 服务销毁前解除本实例对进程级 session 的托管（移除通知 controller + 清 session listener），
    // 避免已销毁实例迟到的 listener 携旧 UID 重启服务被判 stale；不释放 AudioEngine（进程级单例，销毁不应毁播放内核），重绑时新 service 会再 addSession
    override fun onDestroy() {
        AudioEngine.mediaSession?.let { if (isSessionAdded(it)) removeSession(it) }
        super.onDestroy()
    }
}
