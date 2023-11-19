package fun.upup.musicfree.lyricUtil;

import android.app.Activity;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.ColorDrawable;
import android.hardware.SensorManager;
import android.os.Build;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.OrientationEventListener;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.ReactContext;

import java.util.Map;

public class LyricView extends Activity implements View.OnTouchListener {

    private WindowManager windowManager = null;

    private OrientationEventListener orientationEventListener = null;

    private WindowManager.LayoutParams layoutParams = null;

    private TextView tv = null;

    private final ReactContext reactContext;

    LyricView(ReactContext _reactContext) {
        reactContext = _reactContext;
    }

    // 窗口信息
    private double windowWidth;

    private double windowHeight;

    private double widthPercent;

    private double leftPercent;

    private double topPercent = 0;



    @Override
    public boolean onTouch(View view, MotionEvent motionEvent) {
        Log.d("touch", "Desktop Touch");
        return false;
    }

    // 展示歌词窗口
    public void showLyricWindow(String initText, Map<String, Object> options) {
        try {
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
                /*
                 * topPercent: number;
                 * leftPercent: number;
                 * align: number;
                 * color: string;
                 * backgroundColor: string;
                 * widthPercent: number;
                 * fontSize: number;
                 */
                Object topPercent = options.get("topPercent");
                Object leftPercent = options.get("leftPercent");
                Object align = options.get("align");
                Object color = options.get("color");
                Object backgroundColor = options.get("backgroundColor");
                Object widthPercent = options.get("widthPercent");
                Object fontSize = options.get("fontSize");

                this.widthPercent = (widthPercent != null ? (double) widthPercent: 0.5);

                layoutParams.width = (int) (this.widthPercent * this.windowWidth);
                layoutParams.height = WindowManager.LayoutParams.WRAP_CONTENT;
                layoutParams.gravity = Gravity.TOP | Gravity.START;
//            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
//                layoutParams.setFitInsetsTypes(0);
//            }
                this.leftPercent = (double) (leftPercent != null ? leftPercent : 0.5);
                layoutParams.x = (int) (this.leftPercent * (this.windowWidth - layoutParams.width));
                layoutParams.y = 0;


                layoutParams.flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE; // 最后一个控制不可点击
                layoutParams.format = PixelFormat.TRANSPARENT;

                tv = new TextView(reactContext);
                if (initText != null) {
                    tv.setText(initText);
                }
                tv.setTextSize(fontSize != null ?  ((Double) fontSize).floatValue() : 14);
                tv.setBackgroundColor(Color.parseColor(rgba2argb(backgroundColor != null ? (String) backgroundColor: "#84888153")));
                tv.setTextColor(Color.parseColor(rgba2argb(color != null ? (String) color: "#FFE9D2")));
                tv.setPadding(12, 6, 12, 6);
                tv.setGravity(align != null ? (int) align: Gravity.CENTER);
                windowManager.addView(tv, layoutParams);

                if (topPercent != null) {
                    setTopPercent((double) topPercent);
                }
                listenOrientationChange();



            }
        } catch(Exception e) {
            hideLyricWindow();
            throw e;
        }
    }

    private void listenOrientationChange() {
        if(windowManager == null) {
            return;
        }
        if (orientationEventListener == null) {
            orientationEventListener = new OrientationEventListener(reactContext, SensorManager.SENSOR_DELAY_NORMAL) {
                @Override
                public void onOrientationChanged(int i) {
                    if(windowManager != null) {
                        DisplayMetrics outMetrics = new DisplayMetrics();
                        windowManager.getDefaultDisplay().getMetrics(outMetrics);
                        windowWidth = outMetrics.widthPixels;
                        windowHeight = outMetrics.heightPixels;
                        layoutParams.width = (int) (widthPercent * windowWidth);
                        layoutParams.x = (int) (leftPercent * (windowWidth - layoutParams.width));
                        layoutParams.y = (int) (topPercent * (windowHeight - tv.getHeight()));
                        windowManager.updateViewLayout(tv, layoutParams);
                    }
                }
            };
        }

        if(orientationEventListener.canDetectOrientation()) {
            orientationEventListener.enable();
        }
    }

    private void unlistenOrientationChange() {
        if(orientationEventListener != null) {
            orientationEventListener.disable();
        }
    }


    String rgba2argb(String color) {
        if (color.length() == 9) {
            return color.charAt(0) + color.substring(7, 9) + color.substring(1, 7);
        } else {
            return color;
        }
    }


    // 隐藏歌词窗口
    public void hideLyricWindow() {
        if (windowManager != null) {
            if (tv != null) {
               try {
                   windowManager.removeView(tv);
               } catch (Exception e) {

                }
                tv = null;
            }
            windowManager = null;
            layoutParams = null;
            unlistenOrientationChange();
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
        this.topPercent = pct;
    }

    public void setLeftPercent(double pct) {
        if (pct < 0) {
            pct = 0;
        }
        if (pct > 1) {
            pct = 1;
        }
        if(tv != null) {
            layoutParams.x = (int) (pct * (windowWidth - layoutParams.width));
            windowManager.updateViewLayout(tv, layoutParams);
        }
        this.leftPercent = pct;
    }

    public void setColors(String textColor, String backgroundColor) {
        if(tv != null) {
            if(textColor != null) {
                tv.setTextColor(Color.parseColor(rgba2argb(textColor)));
            }
            if (backgroundColor != null) {
                ColorDrawable background = new ColorDrawable(Color.parseColor(rgba2argb(backgroundColor)));
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
        this.widthPercent = pct;
    }

    public void setFontSize(float fontSize) {
        if (tv != null) {
            tv.setTextSize(fontSize);
        }
    }



}
