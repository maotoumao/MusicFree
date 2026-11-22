package `fun`.upup.musicfree
import expo.modules.ReactActivityDelegateWrapper
import expo.modules.splashscreen.SplashScreenManager

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import android.os.Bundle
import androidx.core.view.WindowCompat
import android.graphics.Color
import android.os.Build
import android.view.View
import android.view.WindowManager

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "MusicFree"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      ReactActivityDelegateWrapper(this, BuildConfig.IS_NEW_ARCHITECTURE_ENABLED, DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled))

  // https://reactnavigation.org/docs/getting-started/#installing-dependencies-into-a-bare-react-native-project
  override fun onCreate(savedInstanceState: Bundle?) {
      SplashScreenManager.registerOnActivity(this)
      super.onCreate(null);
      WindowCompat.setDecorFitsSystemWindows(window, false)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          window.isNavigationBarContrastEnforced = false
      }
      window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION)
      window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
      var systemUiVisibility = window.decorView.systemUiVisibility
      systemUiVisibility =
          systemUiVisibility or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
      window.decorView.systemUiVisibility = systemUiVisibility
      window.navigationBarColor = Color.TRANSPARENT
  }
}