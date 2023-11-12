package fun.upup.musicfree.lyricUtil;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.util.Log;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;

import com.facebook.react.bridge.ReactContext;

public class LyricView extends Activity implements View.OnTouchListener {

    private WindowManager windowManager = null;
    private WindowManager.LayoutParams layoutParams = null;

    private TextView tv = null;

    private final ReactContext reactContext;

    LyricView(ReactContext _reactContext) {
        reactContext = _reactContext;
    }



    @Override
    public boolean onTouch(View view, MotionEvent motionEvent) {
        Log.d("touch", "Desktop Touch");
        return false;
    }

    // 展示歌词窗口
    public void showLyricWindow(String initText){
        if(windowManager == null) {
            windowManager = (WindowManager) reactContext.getSystemService(WINDOW_SERVICE);
            layoutParams = new WindowManager.LayoutParams();

            layoutParams.type = Build.VERSION.SDK_INT < Build.VERSION_CODES.O ?
                    WindowManager.LayoutParams.TYPE_SYSTEM_ALERT :
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;

            layoutParams.width = WindowManager.LayoutParams.WRAP_CONTENT;
            layoutParams.height = WindowManager.LayoutParams.WRAP_CONTENT;

            layoutParams.flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL;

            tv = new TextView(reactContext);
            if(initText != null) {
                tv.setText(initText);
            }
            tv.setTextColor(Color.parseColor("#66ccff"));
            windowManager.addView(tv, layoutParams);
        }
    }


    // 隐藏歌词窗口
    public void hideLyricWindow(){
        if (windowManager != null) {
            windowManager.removeView(tv);
            tv = null;
            windowManager = null;
            layoutParams = null;
        }
    }

    // 设置歌词内容
    public void setText(String text) {
        if (tv != null) {
            tv.setText(text);
        }
    }
}
