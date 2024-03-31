// 参考：https://blog.stackademic.com/change-the-app-icon-at-runtime-for-react-native-by-creating-a-nativemodule-5bfb285bd69b
package fun.upup.musicfree.appIconUtil;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.app.Activity;
import android.app.Application;
import android.content.ComponentName;
import android.content.pm.PackageManager;
import android.os.Bundle;


import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.util.HashSet;
import java.util.Set;


public class AppIconUtilModule extends ReactContextBaseJavaModule implements Application.ActivityLifecycleCallbacks {
    private static ReactApplicationContext reactContext;

    private final String packageName;

    public static final String MAIN_ACTVITY_BASE_NAME = ".MainActivity";

    private String componentClass = "";

    private final Set<String> classesToKill = new HashSet<>();

    public AppIconUtilModule(ReactApplicationContext context, String packageName) {
        super(context);
        reactContext = context;
        this.packageName = packageName;
    }

    @NonNull
    @Override
    public String getName() {
        return "AppIconUtil";
    }

    @ReactMethod
    public void getIcon(Promise promise) {
        final Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.reject("ACTIVITY_NOT_FOUND", "Activity was not found");
            return;
        }

        final String activityName = activity.getComponentName().getClassName();

        if (activityName.endsWith(MAIN_ACTVITY_BASE_NAME)) {
            promise.resolve("Default");
            return;
        }
        String[] activityNameSplit = activityName.split("MainActivity");
        if (activityNameSplit.length != 2) {
            promise.reject("ANDROID:UNEXPECTED_COMPONENT_CLASS:", this.componentClass);
            return;
        }
        promise.resolve(activityNameSplit[1]);
    }

    @ReactMethod
    public void changeIcon(String iconName, Promise promise) {

        final Activity activity = getCurrentActivity();

        if (activity == null) {
            promise.reject("ACTIVITY_NOT_FOUND", "The activity is null. Check if the app is running properly.");
            return;
        }
        if (iconName.isEmpty()) {
            promise.reject("EMPTY_ICON_STRING", "Icon name is missing i.e. changeIcon('YOUR_ICON_NAME_HERE')");
            return;
        }
        if (this.componentClass.isEmpty()) {
            this.componentClass = activity.getComponentName().getClassName(); // i.e. MyActivity
        }

        final String activeClass = this.packageName + MAIN_ACTVITY_BASE_NAME + iconName;

        if (this.componentClass.equals(activeClass)) {
            promise.reject("ICON_ALREADY_USED", "This icons is the current active icon. " +  this.componentClass);
            return;
        }

        try {
            activity.getPackageManager().setComponentEnabledSetting(
                    new ComponentName(this.packageName, activeClass),
                    PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                    PackageManager.DONT_KILL_APP
            );
            promise.resolve(iconName);
        } catch (Exception e) {
            promise.reject("ICON_INVALID", e.getLocalizedMessage());
            return;
        }

        this.classesToKill.add(this.componentClass);
        this.componentClass = activeClass;
        activity.getApplication().registerActivityLifecycleCallbacks(this);
//      The completeIconChange() is what makes the current active class disabled.
//      Move it to onActivityPaused or onActivityStopped etc to change the icon only when the app closes or goes to background
        completeIconChange();
    }

    private void completeIconChange() {
        final Activity activity = getCurrentActivity();
        if (activity == null) return;

//        Works for minSdkVersion = 23
        for (String className : classesToKill) {
            activity.getPackageManager().setComponentEnabledSetting(
                    new ComponentName(this.packageName, className),
                    PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP
            );
        }
/*
        // Works for minSdkVersion = 24 and above
        classesToKill.forEach((cls) -> activity.getPackageManager().setComponentEnabledSetting(
                new ComponentName(this.packageName, cls),
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP
        ));
*/
        classesToKill.clear();
    }

    @Override
    public void onActivityCreated(@NonNull Activity activity, @Nullable Bundle bundle) {

    }

    @Override
    public void onActivityStarted(@NonNull Activity activity) {

    }

    @Override
    public void onActivityResumed(@NonNull Activity activity) {

    }

    @Override
    public void onActivityPaused(@NonNull Activity activity) {

    }

    @Override
    public void onActivityStopped(@NonNull Activity activity) {

    }

    @Override
    public void onActivitySaveInstanceState(@NonNull Activity activity, @NonNull Bundle bundle) {

    }

    @Override
    public void onActivityDestroyed(@NonNull Activity activity) {

    }
}