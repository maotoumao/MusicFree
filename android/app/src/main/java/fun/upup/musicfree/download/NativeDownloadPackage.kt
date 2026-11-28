package `fun`.upup.musicfree.download

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

// app 内 TurboModule，不参与 autolink，由 MainApplication 手动注册
class NativeDownloadPackage : BaseReactPackage() {

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
        if (name == NativeDownloadEngineModule.NAME) {
            NativeDownloadEngineModule(reactContext)
        } else {
            null
        }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
        mapOf(
            NativeDownloadEngineModule.NAME to ReactModuleInfo(
                NativeDownloadEngineModule.NAME, // 模块名
                NativeDownloadEngineModule.NAME, // 类名
                false, // 不覆盖已有模块
                false, // 不需要提前初始化
                false, // 不是 C++ 模块
                true,  // 是 TurboModule
            ),
        )
    }
}
