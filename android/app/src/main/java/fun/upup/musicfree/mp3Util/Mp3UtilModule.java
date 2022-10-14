package fun.upup.musicfree.mp3Util;

import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;


public class Mp3UtilModule extends ReactContextBaseJavaModule {


    public Mp3UtilModule(ReactApplicationContext context) {
        super(context);
    }

    @NonNull
    @Override
    public String getName() {
        return "Mp3Util";
    }

    private boolean isContentUri(Uri uri) {
        if(uri != null) {
            String scheme = uri.getScheme();
            return scheme != null && scheme.equalsIgnoreCase("content");
        }
        return false;
    }

    @ReactMethod
    public void getBasicMeta(String filePath, Promise promise) {
        try {
            Uri uri = Uri.parse(filePath);
            MediaMetadataRetriever mmr = new MediaMetadataRetriever();
            if(isContentUri(uri)) {
                mmr.setDataSource(getReactApplicationContext(), uri);
            } else {
                mmr.setDataSource(filePath);
            }
            // b站源部分直接转格式的mp3文件好像有问题 0x08000
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
