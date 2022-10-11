package fun.upup.musicfree.utils;

import android.app.Activity;
import android.widget.Toast;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;


public class UtilsModule extends ReactContextBaseJavaModule {
    private static ReactApplicationContext reactContext;

    private static final String DURATION_SHORT_KEY = "SHORT";
    private static final String DURATION_LONG_KEY = "LONG";

    public UtilsModule(ReactApplicationContext context) {
        super(context);
        reactContext = context;
    }

    @Override
    public String getName() {
        return "NativeUtils";
    }

    @ReactMethod
    public void show(String message, int duration) {
        Toast.makeText(getReactApplicationContext(), message, duration).show();
    }

  @ReactMethod
  public void exitApp() {
    Activity activity = reactContext.getCurrentActivity();
    if(activity != null) {
      activity.finishAndRemoveTask();
    }
    android.os.Process.killProcess(android.os.Process.myPid());
    System.exit(0);
  }
}