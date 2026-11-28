package `fun`.upup.musicfree.download

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.annotation.RequiresApi
import androidx.core.app.NotificationCompat

/**
 * 下载前台服务（A1）：仅在存在活动下载时运行，用于保活进程并满足 Android 后台数据传输要求
 * DownloadEngine 在首个任务启动时 start，在没有活动任务时 stop
 * 前台服务是注册到 Manifest 的 OS 级组件，名称与 MusicFreeAudioService 对齐，使用品牌前缀便于系统识别
 * native 不持有译文：引导态通知使用语言中立品牌串，本地化动态文案和渠道名由 JS 经
 * setNotificationContext / setup 交付；相关聚合通知能力属于 A4
 */
class MusicFreeDownloadService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // 停止走命令而非外部 stopService：命令与启动同在主线程按投递顺序处理，故 startForeground 必已兑现；
        // 再由 stopSelfResult 交给系统按 startId 裁决——期间若已登记更新的启动命令，本次停止自动失效
        if (intent?.action == ACTION_STOP) {
            stopSelfResult(startId)
            return START_NOT_STICKY
        }
        val notification = buildNotification(this)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        return START_NOT_STICKY
    }

    /**
     * Android 15+ dataSync 前台服务单次运行超时回调：暂停所有传输并退出前台，避免不停止前台状态导致的致命 RemoteServiceException
     * 暂停保留 `.part`，条件合适时 JS 再 start 续传；进程若随后被系统回收，靠重启后从持久化队列与磁盘 `.part` 恢复
     */
    @RequiresApi(Build.VERSION_CODES.VANILLA_ICE_CREAM)
    override fun onTimeout(startId: Int, fgsType: Int) {
        // 停止动作交由引擎在其前台服务锁内执行：与「标记服务已被系统收回」原子完成，
        // 避免中途有新任务发出启动命令、其前台契约尚未兑现就被本次停止拆除
        DownloadEngine.onServiceTimeout {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        // 引擎是进程级单例，服务销毁不影响引擎；活动任务仍由引擎持有
    }

    companion object {
        private const val CHANNEL_ID = "musicfree_download"
        private const val NOTIFICATION_ID = 0x4d46 // 'MF'
        private const val ACTION_STOP = "fun.upup.musicfree.download.STOP"

        fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val nm = context.getSystemService(NotificationManager::class.java)
                if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                    nm.createNotificationChannel(
                        // 使用语言中立品牌串；A4 再由 JS 交付本地化渠道名
                        NotificationChannel(CHANNEL_ID, "MusicFree", NotificationManager.IMPORTANCE_LOW),
                    )
                }
            }
        }

        fun start(context: Context) {
            val intent = Intent(context, MusicFreeDownloadService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            // 不用 stopService：启动后到 onStartCommand 兑现 startForeground 之间若被拆除，
            // 系统会判定违约并抛 RemoteServiceException 杀掉进程（断网秒失败时必现）。
            // 改为向同一个已启动的服务投递停止命令，由它自己收尾
            val stopIntent = Intent(context, MusicFreeDownloadService::class.java).setAction(ACTION_STOP)
            try {
                context.startService(stopIntent)
            } catch (_: Exception) {
                // 停止命令未能登记时不能退回 stopService：无从判断前台契约是否已兑现，拆除服务可能重演上述崩溃
                // 服务要么本就未启动，要么由下一轮启动 / 停止命令或超时回调收尾
            }
        }

        private fun buildNotification(context: Context): Notification =
            NotificationCompat.Builder(context, CHANNEL_ID)
                // 引导态仅显示语言中立品牌标题；下载中的本地化文案由 A4 的 setNotificationContext 提供
                .setContentTitle("MusicFree")
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build()
    }
}
