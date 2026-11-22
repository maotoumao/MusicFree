package `fun`.upup.musicfree.blurlyric

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager

class BlurLyricViewPackage : ReactPackage {

    @Suppress("UNCHECKED_CAST")
    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): MutableList<ViewManager<View, ReactShadowNode<*>>> =
        mutableListOf(BlurLyricViewManager() as ViewManager<View, ReactShadowNode<*>>)

    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): MutableList<NativeModule> = mutableListOf()
}
