package fun.upup.musicfree.mp3Util;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import org.jaudiotagger.audio.AudioFile;
import org.jaudiotagger.audio.AudioFileIO;
import org.jaudiotagger.tag.FieldKey;
import org.jaudiotagger.tag.Tag;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;


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

    private boolean isContentUri(Uri uri) {
        if (uri != null) {
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
            if (isContentUri(uri)) {
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

    @ReactMethod
    public void getMediaMeta(ReadableArray filePaths, Promise promise) {
        WritableArray metas = Arguments.createArray();
        MediaMetadataRetriever mmr = new MediaMetadataRetriever();
        for (int i = 0; i < filePaths.size(); ++i) {
            try {
                String filePath = filePaths.getString(i);
                Uri uri = Uri.parse(filePath);

                if (isContentUri(uri)) {
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
                metas.pushMap(properties);

            } catch (Exception e) {
                metas.pushNull();
            }
        }
        try {
            mmr.release();
        } catch (Exception ignored) {
        }
        promise.resolve(metas);

    }


    // 读取内置的封面图,直接返回临时文件路径
    @ReactMethod
    public void getMediaCoverImg(String filePath, Promise promise) {
        int pathHashCode;
        try {
            File file = new File(filePath);
            if (!file.exists()) {
                promise.reject("File not exist", "File not exist");
                return;
            }
            // 路径的hashcode就够了
            pathHashCode = file.hashCode();
            if (pathHashCode == 0) {
                promise.resolve(null);
                return;
            }
            // 判断缓存是否存在，如果存在直接返回
            File cacheDir = reactContext.getCacheDir();
            File coverFile = new File(cacheDir, "image_manager_disk_cache/" + pathHashCode + ".jpg");
            if (coverFile.exists()) {
                promise.resolve(coverFile.toURI().toString());
                return;
            }
            MediaMetadataRetriever mmr = new MediaMetadataRetriever();
            mmr.setDataSource(filePath);
            byte[] coverImg = mmr.getEmbeddedPicture();
            if (coverImg != null) {
                Bitmap bitmap = BitmapFactory.decodeByteArray(coverImg, 0, coverImg.length);
                // 存储到本地路径
                FileOutputStream outputStream = new FileOutputStream(coverFile);
                bitmap.compress(Bitmap.CompressFormat.JPEG, 100, outputStream);
                outputStream.flush();
                outputStream.close();
                promise.resolve(coverFile.toURI().toString());
            } else {

                promise.resolve(null);
            }
            mmr.release();
        } catch (Exception ignored) {
            promise.reject("Error", "Got error");
        }

    }


    // 读取歌词
    @ReactMethod
    public void getLyric(String filePath, Promise promise) {
        try {
            File file = new File(filePath);
            if (file.exists()) {
                AudioFile audioFile = AudioFileIO.read(file);
                Tag tag = audioFile.getTag();
                String lrc = tag.getFirst(FieldKey.LYRICS);
                promise.resolve(lrc);
            } else {
                throw new IOException("File not found");
            }

        } catch (Exception e) {
            promise.reject("Error", e.getMessage());
        }
    }

    @ReactMethod
    public void setMediaTag(String filePath, ReadableMap meta, Promise promise) {
        try {
            File file = new File(filePath);
            if (file.exists()) {
                AudioFile audioFile = AudioFileIO.read(file);
                Tag tag = audioFile.getTag();
                String title = meta.getString("title");
                String artist = meta.getString("artist");
                String album = meta.getString("album");
                String lyric = meta.getString("lyric");
                String comment = meta.getString("comment");
                if (title != null) {
                    tag.setField(FieldKey.TITLE, title);
                }
                if (artist != null) {
                    tag.setField(FieldKey.ARTIST, artist);
                }
                if (album != null) {
                    tag.setField(FieldKey.ALBUM, album);
                }
                if(lyric != null) {
                    tag.setField(FieldKey.LYRICS, lyric);
                }

                tag.setField(FieldKey.COMMENT, comment);
                audioFile.commit();
            } else {
                promise.reject("Error", "File Not Exist");
            }
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("Error", e.getMessage());
        }
    }

    @ReactMethod
    public void getMediaTag(String filePath, Promise promise) {
        try {
            File file = new File(filePath);
            if (file.exists()) {
                AudioFile audioFile = AudioFileIO.read(file);
                Tag tag = audioFile.getTag();
                String title = tag.getFirst(FieldKey.TITLE);
                String artist = tag.getFirst(FieldKey.ARTIST);
                String album = tag.getFirst(FieldKey.ALBUM);
                String lyric = tag.getFirst(FieldKey.LYRICS);
                String comment = tag.getFirst(FieldKey.COMMENT);

                WritableMap properties = Arguments.createMap();
                properties.putString("title", title);
                properties.putString("artist", artist);
                properties.putString("album", album);
                properties.putString("lyric", lyric);
                properties.putString("comment", comment);
                promise.resolve(properties);
            } else{
                promise.reject("Error", "File Not Found");
            }
        } catch (Exception e) {
            promise.reject("Error", e.getMessage());
        }
    }
}
