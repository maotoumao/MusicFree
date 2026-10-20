package `fun`.upup.musicfree.widget

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.ViewManager
import com.doublesymmetry.trackplayer.service.MusicService
import java.lang.ref.WeakReference

class MusicWidgetPackage : ReactPackage {
    override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
        listOf(MusicWidgetModule(context))
    override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class MusicWidgetModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = "MusicWidget"

    @ReactMethod
    fun finishAction(request: String, promise: Promise) {
        MusicService.finishWidgetAction(request)
        promise.resolve(null)
    }

    @ReactMethod
    fun isActionActive(request: String, promise: Promise) {
        com.facebook.react.bridge.UiThreadUtil.runOnUiThread {
            promise.resolve(MusicService.isWidgetActionActive(request))
        }
    }

    @ReactMethod
    fun updatePlayback(snapshot: ReadableMap, promise: Promise) {
        try {
            MusicWidgetStore.updatePlayback(context, snapshot)
            promise.resolve(null)
        } catch (error: Exception) {
            promise.reject("WIDGET_UPDATE", error)
        }
    }

    @ReactMethod
    fun updateColors(colors: ReadableMap, promise: Promise) {
        try {
            val edit = MusicWidgetStore.preferences(context).edit()
            for (key in listOf("surface", "text", "secondary", "primary", "onPrimary")) {
                if (colors.hasKey(key)) colors.getString(key)?.let { edit.putString(key, it) }
            }
            edit.apply()
            MusicWidgetProvider.updateAll(context)
            promise.resolve(null)
        } catch (error: Exception) {
            promise.reject("WIDGET_COLORS", error)
        }
    }

    @ReactMethod
    fun setReady(ready: Boolean, promise: Promise) {
        MusicWidgetStore.reactContext = if (ready) WeakReference(context) else null
        MusicWidgetProvider.updateAll(context)
        promise.resolve(null)
    }

    override fun invalidate() {
        if (MusicWidgetStore.reactContext?.get() === context) {
            MusicWidgetStore.reactContext = null
            MusicWidgetStore.playing = false
            MusicWidgetStore.loading = false
            MusicWidgetProvider.updateAll(context)
        }
        super.invalidate()
    }
}
