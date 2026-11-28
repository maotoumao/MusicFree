package `fun`.upup.musicfree.floatingLyric

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

// app 内 TurboModule，非 autolink，在 MainApplication 手动注册
class NativeFloatingLyricPackage : BaseReactPackage() {

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
        if (name == NativeFloatingLyricModule.NAME) {
            NativeFloatingLyricModule(reactContext)
        } else {
            null
        }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
        mapOf(
            NativeFloatingLyricModule.NAME to ReactModuleInfo(
                NativeFloatingLyricModule.NAME, // name
                NativeFloatingLyricModule.NAME, // className
                false, // canOverrideExistingModule
                false, // needsEagerInit
                false, // isCxxModule
                true,  // isTurboModule
            ),
        )
    }
}
