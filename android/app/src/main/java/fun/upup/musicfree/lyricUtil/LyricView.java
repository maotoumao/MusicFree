package fun.upup.musicfree.lyricUtil;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Gravity;
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

    // 窗口信息
    private double windowWidth;

    private double windowHeight;


    // 歌词信息
    private double lyricWidthPercent;

    private float fontSize = 15;


    @Override
    public boolean onTouch(View view, MotionEvent motionEvent) {
        Log.d("touch", "Desktop Touch");
        return false;
    }

    // 展示歌词窗口
    public void showLyricWindow(String initText) {
        if (windowManager == null) {
            windowManager = (WindowManager) reactContext.getSystemService(WINDOW_SERVICE);
            layoutParams = new WindowManager.LayoutParams();

            DisplayMetrics outMetrics = new DisplayMetrics();
            windowManager.getDefaultDisplay().getMetrics(outMetrics);
            this.windowWidth = outMetrics.widthPixels;
            this.windowHeight = outMetrics.heightPixels;

            layoutParams.type = Build.VERSION.SDK_INT < Build.VERSION_CODES.O ?
                    WindowManager.LayoutParams.TYPE_SYSTEM_ALERT :
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;

            layoutParams.width = (int) (0.5 * this.windowWidth);
            layoutParams.height = WindowManager.LayoutParams.WRAP_CONTENT;
            layoutParams.gravity = Gravity.TOP | Gravity.START;
//            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
//                layoutParams.setFitInsetsTypes(0);
//            }
            layoutParams.y = 0;


            layoutParams.flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                    | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;
            layoutParams.format = PixelFormat.TRANSPARENT;

            tv = new TextView(reactContext);
            if (initText != null) {
                tv.setText(initText);
            }
            tv.setTextSize(fontSize);
            tv.setTextColor(Color.parseColor("#66ccff"));
            tv.setBackgroundColor(Color.TRANSPARENT);
            tv.setPadding(12, 6, 12, 6);
            windowManager.addView(tv, layoutParams);


        }
    }


    // 隐藏歌词窗口
    public void hideLyricWindow() {
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


    public void setAlign(int gravity) {
        if (tv != null) {
//            tv.setTextAlignment(alignment);
            tv.setGravity(gravity);
        }
    }

    public void setTopPercent(double pct) {
        if (pct < 0) {
            pct = 0;
        }
        if (pct > 1) {
            pct = 1;
        }
        if (tv != null) {
            layoutParams.y = (int) (pct * (windowHeight - tv.getHeight()));
            windowManager.updateViewLayout(tv, layoutParams);
        }
    }

    public void setLeftPercent(double pct) {
        if (pct < 0) {
            pct = 0;
        }
        if (pct > 1) {
            pct = 1;
        }
        if(tv != null) {
            layoutParams.x = (int) (pct * (windowWidth - tv.getWidth()));
            windowManager.updateViewLayout(tv, layoutParams);
        }
    }

    public void setColors(String textColor, String backgroundColor) {
        if(tv != null) {
            if(textColor != null) {
                tv.setTextColor(Color.parseColor(textColor));
            }
            if (backgroundColor != null) {
                ColorDrawable background = new ColorDrawable(Color.parseColor(backgroundColor));
                tv.setBackground(background);
            }
        }
    }

    public void setWidth(double pct) {
        if (pct < 0.3) {
            pct = 0.3;
        }
        if (pct > 1) {
            pct = 1;
        }
        if(tv != null) {
            int width = (int) (pct * this.windowWidth);
            int originalWidth = layoutParams.width;
            if(width <= originalWidth) {
                layoutParams.x += ((originalWidth - width) / 2);
            } else {
                layoutParams.x -= ((width - originalWidth) / 2);
                if (layoutParams.x < 0) {
                    layoutParams.x = 0;
                } else if(layoutParams.x + width > windowWidth) {
                    layoutParams.x = (int) (windowWidth - width);
                }
            }
            layoutParams.width = width;
            windowManager.updateViewLayout(tv, layoutParams);
        }
    }

    public void setFontSize(float fontSize) {
        if (tv != null) {
            tv.setTextSize(fontSize);
        }
    }

}
