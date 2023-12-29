package fun.upup.musicfree.lyricUtil;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.UiThreadUtil;

import java.util.HashMap;
import java.util.Map;


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
    public void checkSystemAlertPermission(Promise promise){
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                promise.resolve(Settings.canDrawOverlays(reactContext));
            }
            promise.resolve(true);
        } catch(Exception e) {
            promise.reject("Error", e.getMessage());
        }
    }

    @RequiresApi(api = Build.VERSION_CODES.M)
    @ReactMethod
    public void requestSystemAlertPermission(Promise promise){
        try {
           Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
           intent.setData(Uri.parse("package:" + getReactApplicationContext().getPackageName()));
            Activity currentActivity = getCurrentActivity();
            if (currentActivity != null) {
                currentActivity.startActivity(intent);
            }
            promise.resolve(true);
        } catch(Exception e) {
            promise.reject("Error", e.getMessage());
        }
    }


    @ReactMethod
    public void showStatusBarLyric(String initLyric, ReadableMap options, Promise promise) {
        try {
            UiThreadUtil.runOnUiThread(() -> {
                if(lyricView == null) {
                    lyricView = new LyricView(reactContext);
                }
                /**
                 * topPercent: number;
                 * leftPercent: number;
                 * align: number;
                 * color: string;
                 * backgroundColor: string;
                 * widthPercent: number;
                 * fontSize: number;
                 */
                Map<String, Object> mapOptions = new HashMap<>();
                if(options.hasKey("topPercent")) {
                    mapOptions.put("topPercent", options.getDouble("topPercent"));
                }
                if(options.hasKey("leftPercent")) {
                    mapOptions.put("leftPercent", options.getDouble("leftPercent"));
                }
                if(options.hasKey("align")) {
                    mapOptions.put("align", options.getInt("align"));

                }
                if(options.hasKey("color")) {
                    mapOptions.put("color", options.getString("color"));

                }
                if(options.hasKey("backgroundColor")) {
                    mapOptions.put("backgroundColor", options.getString("backgroundColor"));

                }
                if(options.hasKey("widthPercent")) {
                    mapOptions.put("widthPercent", options.getDouble("widthPercent"));

                }
                if(options.hasKey("fontSize")) {
                    mapOptions.put("fontSize", options.getDouble("fontSize"));

                }
                try {
                    lyricView.showLyricWindow(initLyric, mapOptions);
                    promise.resolve(true);
                } catch (Exception e) {
                    promise.reject("Exception", e.getMessage());
                }
            });
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

    @ReactMethod
    public void setStatusBarLyricAlign(int alignment, Promise promise) {
        try {
            UiThreadUtil.runOnUiThread(() -> {
                if(lyricView != null) {
                    lyricView.setAlign(alignment);
                }
            });
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("Exception", e.getMessage());
        }
    }

    @ReactMethod
    public void setStatusBarLyricTop(double pct, Promise promise) {
        try {
            UiThreadUtil.runOnUiThread(() -> {
                if(lyricView != null) {
                    lyricView.setTopPercent(pct);
                }
            });
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("Exception", e.getMessage());
        }
    }

    @ReactMethod
    public void setStatusBarLyricLeft(double pct, Promise promise) {
        try {
            UiThreadUtil.runOnUiThread(() -> {
                if(lyricView != null) {
                    lyricView.setLeftPercent(pct);
                }
            });
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("Exception", e.getMessage());
        }
    }

    @ReactMethod
    public void setStatusBarLyricWidth(double pct, Promise promise) {
        try {
            UiThreadUtil.runOnUiThread(() -> {
                if(lyricView != null) {
                    lyricView.setWidth(pct);
                }
            });
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("Exception", e.getMessage());
        }
    }

    @ReactMethod
    public void setStatusBarLyricFontSize(float fontSize, Promise promise) {
        try {
            UiThreadUtil.runOnUiThread(() -> {
                if(lyricView != null) {
                    lyricView.setFontSize(fontSize);
                }
            });
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("Exception", e.getMessage());
        }
    }

    @ReactMethod
    public void setStatusBarColors(String textColor, String backgroundColor, Promise promise) {
        try {
            UiThreadUtil.runOnUiThread(() -> {
                if(lyricView != null) {
                    lyricView.setColors(textColor, backgroundColor);
                }
            });
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("Exception", e.getMessage());
        }
    }



}
