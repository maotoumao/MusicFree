package fun.upup.musicfree.mp3Util;

import android.media.MediaMetadataRetriever;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;

import java.util.Map;
import java.util.HashMap;


public class Mp3UtilModule extends ReactContextBaseJavaModule {
    private static ReactApplicationContext reactContext;


    public Mp3UtilModule(ReactApplicationContext context) {
        super(context);
        reactContext = context;
    }

    @NonNull
    @Override
    public String getName() {
        return "Mp3Util";
    }


    @ReactMethod
    public void getBasicMeta(String filePath, Promise promise) {
        try {
            MediaMetadataRetriever mmr = new MediaMetadataRetriever();
            mmr.setDataSource(filePath);
            WritableMap properties = Arguments.createMap();
            properties.putString("duration", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION));
            properties.putString("bitrate", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE));
            properties.putString("artist", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST));
            properties.putString("author", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_AUTHOR));
            properties.putString("album", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM));
            properties.putString("title", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE));
            properties.putString("date", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DATE));
            properties.putString("year", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_YEAR));
            promise.resolve(properties);
        } catch (Exception e) {
            promise.reject("Exception", e.getMessage());
        }

    }
}
