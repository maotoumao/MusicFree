package `fun`.upup.musicfree

import android.app.Application
import android.content.res.Configuration
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import `fun`.upup.musicfree.audio.NativeAudioPackage
import `fun`.upup.musicfree.download.NativeDownloadPackage
import `fun`.upup.musicfree.floatingLyric.NativeFloatingLyricPackage
import `fun`.upup.musicfree.mediaScanner.NativeMediaScannerPackage
import `fun`.upup.musicfree.sharedStorage.NativeSharedStoragePackage
import `fun`.upup.musicfree.system.NativeSystemPackage
import `fun`.upup.musicfree.tags.NativeAudioTagsPackage
import `fun`.upup.musicfree.timer.NativeTimerPackage
import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
          add(NativeAudioPackage())
          add(NativeDownloadPackage())
          add(NativeSystemPackage())
          add(NativeTimerPackage())
          add(NativeAudioTagsPackage())
          add(NativeFloatingLyricPackage())
          add(NativeMediaScannerPackage())
          add(NativeSharedStoragePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
