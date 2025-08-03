package fun.upup.musicfree.widget

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WidgetModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "MusicWidget"

    @ReactMethod
    fun updateWidget() {
        MusicWidgetProvider.updateWidget(reactApplicationContext)
    }
}