package `fun`.upup.musicfree.utils; // replace your-apps-package-name with your app’s package name
import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.util.DisplayMetrics
import android.view.WindowInsets
import android.view.WindowManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import kotlin.system.exitProcess

class UtilsModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

    private val reactContext: ReactApplicationContext = context;

    override fun getName() = "NativeUtils"

    @ReactMethod
    fun exitApp() {
        val activity = reactContext.currentActivity
        activity?.finishAndRemoveTask()
        android.os.Process.killProcess(android.os.Process.myPid())
        exitProcess(0)
    }

    @ReactMethod
    fun checkStoragePermission(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            promise.resolve(Environment.isExternalStorageManager())
        } else {
            val readPermission = ContextCompat.checkSelfPermission(reactContext, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
            val writePermission = ContextCompat.checkSelfPermission(reactContext, Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
            promise.resolve(readPermission && writePermission)
        }
    }

    @ReactMethod
    fun requestStoragePermission() {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                data = Uri.parse("package:${reactContext.packageName}")
            }
        } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${reactContext.packageName}")
            }
        }
        reactContext.currentActivity?.startActivity(intent)
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getWindowDimensions(): WritableMap {
        val windowManager = reactApplicationContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val windowMetrics = windowManager.currentWindowMetrics
        val insets = windowMetrics.windowInsets.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars())
        val bounds = windowMetrics.bounds

        val totalWidthPx = bounds.width()
        val totalHeightPx = bounds.height()

        val leftInsetPx = insets.left
        val rightInsetPx = insets.right
        val topInsetPx = insets.top
        val bottomInsetPx = insets.bottom

        val usableWidthPx = totalWidthPx - leftInsetPx - rightInsetPx
        val usableHeightPx = totalHeightPx - topInsetPx - bottomInsetPx

        val displayMetrics: DisplayMetrics = reactApplicationContext.resources.displayMetrics
        val density = displayMetrics.density

        val usableWidthDp = usableWidthPx / density
        val usableHeightDp = usableHeightPx / density

        return Arguments.createMap().apply {
            putDouble("width", usableWidthDp.toDouble())
            putDouble("height", usableHeightDp.toDouble())
        }
    }
}
