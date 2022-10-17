package fun.upup.musicfree.utils;

import android.app.Activity;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;


public class UtilsModule extends ReactContextBaseJavaModule {
    private static ReactApplicationContext reactContext;


    public UtilsModule(ReactApplicationContext context) {
        super(context);
        reactContext = context;
    }

    @NonNull
    @Override
    public String getName() {
        return "NativeUtils";
    }


    @ReactMethod
    public void exitApp() {
        Activity activity = reactContext.getCurrentActivity();
        if (activity != null) {
            activity.finishAndRemoveTask();
        }
        android.os.Process.killProcess(android.os.Process.myPid());
        System.exit(0);
    }
}