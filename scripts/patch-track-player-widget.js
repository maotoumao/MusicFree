const fs = require("fs");

// RNTP 4.x rejects all background setup. Permit it only while its own service
// is already foregrounded by an explicit user widget click, before JS starts.
module.exports = function patchWidgetPlayback(servicePath, modulePath) {
    const marker = "musicfree-widget-playback-v1";
    let service = fs.readFileSync(servicePath, "utf8").replace(/\r\n/g, "\n");
    let nativeModule = fs.readFileSync(modulePath, "utf8").replace(/\r\n/g, "\n");
    function replace(source, oldText, newText) {
        if (!source.includes(oldText)) throw new Error(`Widget playback patch anchor missing: ${oldText.slice(0, 90)}`);
        return source.replace(oldText, newText);
    }
    if (!service.includes(marker)) {
        service = replace(service, "    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {", `    // ${marker}
    private val widgetHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private val widgetRequests = mutableMapOf<String, Runnable>()

    private fun startWidgetAction(intent: Intent) {
        val control = intent.getStringExtra("control") ?: return
        if (control !in setOf("toggle", "previous", "next", "shiyin")) return
        // Satisfy the foreground-service deadline before loading React/Hermes/plugins.
        if (!isForegroundService()) {
            val channel = getString(TrackPlayerR.string.rntp_temporary_channel_id)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(
                    NotificationChannel(channel, getString(TrackPlayerR.string.rntp_temporary_channel_name), NotificationManager.IMPORTANCE_LOW)
                )
            }
            val notification = NotificationCompat.Builder(this, channel)
                .setSmallIcon(ExoPlayerR.drawable.exo_notification_small_icon)
                .setContentTitle(applicationInfo.loadLabel(packageManager))
                .setContentText(intent.getStringExtra("widgetStatus"))
                .setOngoing(true).setOnlyAlertOnce(true)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .build()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(EMPTY_NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
            } else startForeground(EMPTY_NOTIFICATION_ID, notification)
        }
        widgetService = java.lang.ref.WeakReference(this)
        widgetStartupInProgress = true
        val request = android.os.SystemClock.elapsedRealtimeNanos().toString()
        val timeout = Runnable {
            Timber.e("Widget action timed out: %s", control)
            intent.getStringExtra("widgetFailure")?.let {
                android.widget.Toast.makeText(this, it, android.widget.Toast.LENGTH_LONG).show()
            }
            completeWidgetAction(request)
        }
        widgetRequests[request] = timeout
        widgetHandler.postDelayed(timeout, 120_000)
        Timber.i("Widget action started: %s request=%s", control, request)
        startTask(HeadlessJsTaskConfig("MusicFreeWidget", Arguments.createMap().apply {
            putString("control", control)
            putString("request", request)
        }, 120_000, true))
    }

    private fun completeWidgetAction(request: String) {
        val timeout = widgetRequests.remove(request) ?: return
        widgetHandler.removeCallbacks(timeout)
        Timber.i("Widget action completed: request=%s remaining=%s", request, widgetRequests.size)
        if (widgetRequests.isNotEmpty()) return
        widgetStartupInProgress = false
        val ongoing = this::player.isInitialized && player.playWhenReady &&
            player.playerState !in listOf(AudioPlayerState.IDLE, AudioPlayerState.STOPPED, AudioPlayerState.ERROR, AudioPlayerState.ENDED)
        if (!ongoing) {
            val hasTrack = this::player.isInitialized && player.currentItem != null
            @Suppress("DEPRECATION")
            stopForeground(!hasTrack)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "musicfree.widget.CONTROL") {
            try {
                startWidgetAction(intent)
            } catch (error: Exception) {
                Timber.e(error, "Unable to start widget playback")
                intent.getStringExtra("widgetFailure")?.let {
                    android.widget.Toast.makeText(this, it, android.widget.Toast.LENGTH_LONG).show()
                }
                if (widgetRequests.isEmpty()) {
                    widgetStartupInProgress = false
                    stopSelf(startId)
                }
            }
            return START_NOT_STICKY
        }`);
        service = replace(service, "        startAndStopEmptyNotificationToAvoidANR()", "        if (!widgetStartupInProgress) startAndStopEmptyNotificationToAvoidANR()");
        service = replace(service,
            "return stopForegroundWhenNotOngoing && (removeNotificationWhenNotOngoing || isForegroundService())",
            "return widgetRequests.isEmpty() && stopForegroundWhenNotOngoing && (removeNotificationWhenNotOngoing || isForegroundService())");
        service = replace(service, "    override fun onDestroy() {", `    override fun onDestroy() {
        widgetHandler.removeCallbacksAndMessages(null)
        widgetRequests.clear()
        if (widgetService?.get() === this) {
            widgetService = null
            widgetStartupInProgress = false
        }`);
        service = replace(service, "    companion object {", `    companion object {
        @Volatile var widgetStartupInProgress = false
            private set
        private var widgetService: java.lang.ref.WeakReference<MusicService>? = null

        fun finishWidgetAction(request: String) {
            widgetService?.get()?.let { service ->
                service.widgetHandler.post { service.completeWidgetAction(request) }
            }
        }

        fun isWidgetActionActive(request: String): Boolean = widgetService?.get()?.widgetRequests?.containsKey(request) == true
`);
    }
    if (!nativeModule.includes(marker)) {
        const backgroundGuard = "if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && AppForegroundTracker.backgrounded) {";
        nativeModule = replace(nativeModule,
            backgroundGuard,
            `// ${marker}: the widget has already foregrounded this playback service.
        ${backgroundGuard.replace(") {", " && !MusicService.widgetStartupInProgress) {")}`);
        nativeModule = replace(nativeModule,
            "            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {\n                context.startForegroundService(intent)\n            } else {\n                context.startService(intent)\n            }",
            `            // A widget cold start binds the already foregrounded service; it must not
        // issue another late foreground-service start after plugin initialization.
        if (!MusicService.widgetStartupInProgress) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
            else context.startService(intent)
        }`);
    }
    // Upgrade already-patched playback-only checkouts without duplicating hooks.
    if (!service.includes('if (control !in setOf("toggle", "previous", "next", "shiyin"))')) {
        service = replace(service,
            'if (control !in setOf("toggle", "previous", "next"))',
            'if (control !in setOf("toggle", "previous", "next", "shiyin"))');
    }
    fs.writeFileSync(servicePath, service);
    fs.writeFileSync(modulePath, nativeModule);
};

if (require.main === module) {
    const path = require("path");
    const root = path.dirname(require.resolve("react-native-track-player/package.json"));
    const nativeRoot = path.join(root, "android/src/main/java/com/doublesymmetry/trackplayer");
    module.exports(path.join(nativeRoot, "service/MusicService.kt"), path.join(nativeRoot, "module/MusicModule.kt"));
}
