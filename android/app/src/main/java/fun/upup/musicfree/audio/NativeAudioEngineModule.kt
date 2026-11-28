package `fun`.upup.musicfree.audio

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import `fun`.upup.musicfree.specs.NativeAudioEngineSpec

/** NativeAudioEngineSpec 由 codegen 生成，首次 build 后才存在。命令委托 AudioEngine，事件转发到 JS。 */
@ReactModule(name = NativeAudioEngineModule.NAME)
class NativeAudioEngineModule(private val reactContext: ReactApplicationContext) :
    NativeAudioEngineSpec(reactContext), AudioEngine.Listener {

    override fun getEngineVersion(): String = "$ENGINE_NAME/$ENGINE_VERSION"

    override fun setup(options: ReadableMap, promise: Promise) {
        AudioEngine.setListener(this)
        AudioEngine.init(reactContext)
        AudioEngine.setMixWithOthers(
            options.hasKey("mixWithOthers") && options.getBoolean("mixWithOthers"),
        )
        if (options.hasKey("progressIntervalMs")) {
            val raw = options.getDouble("progressIntervalMs")
            if (raw.isFinite()) AudioEngine.setProgressIntervalMs(raw.toLong())
        }
        // 缓存配置（边下边播）
        val cacheEnabled = options.hasKey("cacheEnabled") && options.getBoolean("cacheEnabled")
        val maxCacheBytes =
            if (options.hasKey("maxCacheBytes")) options.getDouble("maxCacheBytes").toLong() else 0L
        AudioEngine.configureCache(cacheEnabled, maxCacheBytes)
        // 建进程内 keep-alive controller 绑定播放服务，钉住其生命周期
        // （避免后台被销毁 → 播放转前台时自启意图 stale → 通知被撤；见 AudioEngine.ensureServiceBound）
        AudioEngine.ensureServiceBound()
        promise.resolve(null)
    }

    override fun ackProgress(deliveryId: Double) {
        if (deliveryId.isFinite()) AudioEngine.acknowledgeProgress(deliveryId.toInt())
    }

    override fun provideSource(requestId: Double, source: ReadableMap?) {
        val id = requestId.toInt()
        try {
            if (source == null) {
                AudioEngine.provideSource(id, null, emptyMap())
                return
            }
            val url = source.getString("url")
            val headers = source.getMap("headers")?.let { readStringMap(it) } ?: emptyMap()
            AudioEngine.provideSource(id, url, headers)
        } catch (e: RuntimeException) {
            // malformed source(类型不对)收敛成一次正常解析失败，别让 native 异常 + loader 空等超时
            AudioEngine.provideSource(id, null, emptyMap())
        }
    }

    override fun setAudio(
        item: ReadableMap,
        autoPlay: Boolean,
        next: ReadableMap?,
        promise: Promise,
    ) {
        val slot = toSlotItem(item)
        if (slot == null) {
            promise.reject(ERR_BAD_ITEM, "item requires platform + id")
            return
        }
        val nextSlot = if (next != null) {
            toSlotItem(next) ?: run {
                promise.reject(ERR_BAD_ITEM, "next requires platform + id")
                return
            }
        } else {
            null
        }
        AudioEngine.setAudio(slot, autoPlay, nextSlot)
        promise.resolve(null)
    }

    override fun setNext(next: ReadableMap?, promise: Promise) {
        if (next == null) {
            AudioEngine.setNext(null) // 显式清空 next
            promise.resolve(null)
            return
        }
        val slot = toSlotItem(next)
        if (slot == null) {
            promise.reject(ERR_BAD_ITEM, "next requires platform + id")
            return
        }
        AudioEngine.setNext(slot)
        promise.resolve(null)
    }

    override fun play(promise: Promise) {
        AudioEngine.play()
        promise.resolve(null)
    }

    override fun pause(promise: Promise) {
        AudioEngine.pause()
        promise.resolve(null)
    }

    override fun stop(promise: Promise) {
        AudioEngine.stop()
        promise.resolve(null)
    }

    override fun seekTo(seconds: Double, promise: Promise) {
        AudioEngine.seekTo(seconds)
        promise.resolve(null)
    }

    override fun setRate(rate: Double, promise: Promise) {
        AudioEngine.setRate(rate.toFloat())
        promise.resolve(null)
    }

    override fun getRate(promise: Promise) {
        AudioEngine.getRate { promise.resolve(it.toDouble()) }
    }

    override fun setVolume(volume: Double, promise: Promise) {
        AudioEngine.setVolume(volume.toFloat())
        promise.resolve(null)
    }

    override fun setMixWithOthers(enabled: Boolean) {
        AudioEngine.setMixWithOthers(enabled)
    }

    override fun getProgress(promise: Promise) {
        AudioEngine.getProgress { pos, dur, buf ->
            val m = Arguments.createMap()
            m.putDouble("position", pos)
            m.putDouble("duration", dur)
            m.putDouble("buffered", buf)
            promise.resolve(m)
        }
    }

    override fun getState(promise: Promise) {
        AudioEngine.getState { promise.resolve(it) }
    }

    override fun updateMeta(item: ReadableMap, promise: Promise) {
        // 只更新展示信息；platform+id 是身份，仅当与当前曲一致才应用(防竞态：为已切走的旧曲发的更新贴错到新曲)
        AudioEngine.updateMeta(
            item.getString("platform"),
            item.getString("id"),
            item.getString("title"),
            item.getString("artist"),
            item.getString("artwork"),
        )
        promise.resolve(null)
    }

    override fun reset(promise: Promise) {
        AudioEngine.reset()
        promise.resolve(null)
    }

    /** 缺省的字段=该按钮不显示；state/title 缺失视为不显示（原生不猜默认值）。 */
    override fun setCustomNotificationButtons(buttons: ReadableMap) {
        val specs = listOf(
            CustomNotificationButtons.BUTTON_FAVORITE,
            CustomNotificationButtons.BUTTON_LYRIC,
        ).mapNotNull { button ->
            val m = buttons.getMap(button) ?: return@mapNotNull null
            val state = m.getString("state") ?: return@mapNotNull null
            val title = m.getString("title") ?: return@mapNotNull null
            CustomNotificationButtons.Spec(button, state, title)
        }
        AudioEngine.setCustomNotificationButtons(specs)
    }

    override fun getCacheSize(promise: Promise) {
        AudioEngine.getCacheSize { promise.resolve(it) }
    }

    override fun clearCache(promise: Promise) {
        AudioEngine.clearCache { promise.resolve(null) }
    }

    override fun removeCache(item: ReadableMap, promise: Promise) {
        val slot = toSlotItem(item)
        if (slot == null) {
            promise.reject(ERR_BAD_ITEM, "item requires platform + id")
            return
        }
        AudioEngine.removeCache(slot.cacheKey) { promise.resolve(null) }
    }

    override fun eqGetBands(promise: Promise) {
        AudioEngine.eqGetBands { bands ->
            val arr = Arguments.createArray()
            bands.forEach { b ->
                val m = Arguments.createMap()
                m.putInt("index", b.index)
                m.putInt("centerFreq", b.centerFreq)
                m.putInt("gain", b.gain)
                m.putInt("minGain", b.minGain)
                m.putInt("maxGain", b.maxGain)
                arr.pushMap(m)
            }
            promise.resolve(arr)
        }
    }

    override fun eqSetBandGain(index: Double, millibel: Double, promise: Promise) {
        if (!index.isFinite() || !millibel.isFinite()) {
            promise.resolve(null) // NaN/Inf → toInt 会变 0/极值可能误改频段；直接 no-op
            return
        }
        AudioEngine.eqSetBandGain(index.toInt(), millibel.toInt()) { promise.resolve(null) }
    }

    override fun eqSetEnabled(enabled: Boolean, promise: Promise) {
        AudioEngine.eqSetEnabled(enabled) { promise.resolve(null) }
    }

    override fun eqGetPresets(promise: Promise) {
        AudioEngine.eqGetPresets { presets ->
            val arr = Arguments.createArray()
            presets.forEach { arr.pushString(it) }
            promise.resolve(arr)
        }
    }

    override fun eqUsePreset(name: String, promise: Promise) {
        AudioEngine.eqUsePreset(name) { promise.resolve(null) }
    }

    override fun onStateChanged(state: String) {
        val m = Arguments.createMap()
        m.putString("state", state)
        emitOnStateChange(m)
    }

    override fun onProgress(deliveryId: Int, positionSec: Double, durationSec: Double, bufferedSec: Double, slotId: Long) {
        val m = Arguments.createMap()
        m.putDouble("deliveryId", deliveryId.toDouble())
        m.putDouble("position", positionSec)
        m.putDouble("duration", durationSec)
        m.putDouble("buffered", bufferedSec)
        m.putDouble("slotId", slotId.toDouble())
        emitOnProgress(m)
    }

    override fun onError(item: AudioEngine.SlotItem?, slot: String, code: String, message: String) {
        val m = Arguments.createMap()
        item?.let { m.putMap("item", slotItemToMap(it)) }
        m.putString("slot", slot)
        m.putString("code", code)
        m.putString("message", message)
        emitOnError(m)
    }

    override fun onResolveSource(requestId: Int, item: AudioEngine.SlotItem) {
        val m = Arguments.createMap()
        m.putInt("requestId", requestId)
        m.putMap("item", slotItemToMap(item))
        emitOnResolveSource(m)
    }

    override fun onAudioEnd(ended: AudioEngine.SlotItem, promoted: AudioEngine.SlotItem?) {
        val m = Arguments.createMap()
        m.putMap("ended", slotItemToMap(ended))
        promoted?.let { m.putMap("promoted", slotItemToMap(it)) }
        emitOnAudioEnd(m)
    }

    override fun onStarted(item: AudioEngine.SlotItem) {
        val m = Arguments.createMap()
        m.putMap("item", slotItemToMap(item))
        emitOnStarted(m)
    }

    override fun onEmbeddedArtwork(item: AudioEngine.SlotItem, uri: String) {
        val m = Arguments.createMap()
        m.putMap("item", slotItemToMap(item))
        m.putString("uri", uri)
        emitOnEmbeddedArtwork(m)
    }

    override fun onRemote(command: String) {
        val m = Arguments.createMap()
        m.putString("command", command)
        emitOnRemote(m)
    }

    override fun onCustomNotificationButton(button: String) {
        val m = Arguments.createMap()
        m.putString("button", button)
        emitOnCustomNotificationButton(m)
    }

    override fun invalidate() {
        AudioEngine.clearListener(this)
        super.invalidate()
    }

    /** ReadableMap → SlotItem；platform/id 缺失或字段类型不对返回 null；cacheKey 缺省用 platform_id。 */
    private fun toSlotItem(m: ReadableMap): AudioEngine.SlotItem? = try {
        val platform = m.getString("platform")
        val id = m.getString("id")
        if (platform == null || id == null) {
            null
        } else {
            AudioEngine.SlotItem(
                platform = platform,
                id = id,
                slotId = if (m.hasKey("slotId") && !m.isNull("slotId")) m.getDouble("slotId").toLong() else -1L,
                cacheKey = m.getString("cacheKey") ?: "${platform}_$id",
                streamType = m.getString("streamType"),
                title = m.getString("title"),
                artist = m.getString("artist"),
                album = m.getString("album"),
                artwork = m.getString("artwork"),
                duration = if (m.hasKey("duration") && !m.isNull("duration")) m.getDouble("duration") else null,
                extractEmbeddedArtwork =
                    if (m.hasKey("extractEmbeddedArtwork") && !m.isNull("extractEmbeddedArtwork")) {
                        m.getBoolean("extractEmbeddedArtwork")
                    } else {
                        true
                    },
            )
        }
    } catch (e: RuntimeException) {
        // malformed 字段类型(如 platform 非 string) → 视为无效 item
        null
    }

    private fun slotItemToMap(item: AudioEngine.SlotItem): WritableMap {
        val m = Arguments.createMap()
        m.putString("platform", item.platform)
        m.putString("id", item.id)
        m.putDouble("slotId", item.slotId.toDouble())
        m.putString("cacheKey", item.cacheKey)
        item.streamType?.let { m.putString("streamType", it) }
        item.title?.let { m.putString("title", it) }
        item.artist?.let { m.putString("artist", it) }
        item.album?.let { m.putString("album", it) }
        item.artwork?.let { m.putString("artwork", it) }
        item.duration?.let { m.putDouble("duration", it) }
        return m
    }

    private fun readStringMap(m: ReadableMap): Map<String, String> {
        val out = HashMap<String, String>()
        val it = m.keySetIterator()
        while (it.hasNextKey()) {
            val k = it.nextKey()
            m.getString(k)?.let { v -> out[k] = v }
        }
        return out
    }

    companion object {
        const val NAME = "NativeAudioEngine"

        private const val ENGINE_NAME = "MusicFreeAudio"
        private const val ENGINE_VERSION = "1.0.0"
        private const val ERR_BAD_ITEM = "E_BAD_ITEM"
    }
}
