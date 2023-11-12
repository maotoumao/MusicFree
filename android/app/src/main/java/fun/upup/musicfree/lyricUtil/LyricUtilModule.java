package fun.upup.musicfree.lyricUtil;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.UiThreadUtil;


public class LyricUtilModule extends ReactContextBaseJavaModule {
    private static ReactApplicationContext reactContext;
    private LyricView lyricView;

    public LyricUtilModule(ReactApplicationContext context) {
        super(context);
        reactContext = context;
    }

    @NonNull
    @Override
    public String getName() {
        return "LyricUtil";
    }


    @ReactMethod
    public void showStatusBarLyric(String initLyric, Promise promise) {
        try {
            UiThreadUtil.runOnUiThread(() -> {
                if(lyricView == null) {
                    lyricView = new LyricView(reactContext);
                }
                lyricView.showLyricWindow(initLyric);
            });
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("Exception", e.getMessage());
        }

    }


    @ReactMethod
    public void hideStatusBarLyric(Promise promise) {
        try {
            UiThreadUtil.runOnUiThread(() -> {
                if(lyricView != null) {
                    lyricView.hideLyricWindow();
                }
            });
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("Exception", e.getMessage());
        }
    }

    @ReactMethod
    public void setStatusBarLyricText(String lyric, Promise promise) {
        try {
            UiThreadUtil.runOnUiThread(() -> {
                if(lyricView != null) {
                    lyricView.setText(lyric);
                }
            });
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("Exception", e.getMessage());
        }
    }
}
