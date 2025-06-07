package `fun`.upup.musicfree.widget

import android.content.Context
import android.content.Intent
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class MusicWidgetModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    companion object {
        private const val TAG = "MusicWidgetModule"
        private var instance: MusicWidgetModule? = null
        
        fun sendAction(context: Context, action: String) {
            instance?.sendActionToJS(action)
        }
        
        fun requestCurrentSong(context: Context) {
            instance?.requestCurrentSongFromJS()
        }
    }
    
    init {
        instance = this
    }
    
    override fun getName(): String {
        return "MusicWidgetModule"
    }
    
    private fun sendActionToJS(action: String) {
        val params = Arguments.createMap().apply {
            putString("action", action)
        }
        
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("musicWidgetAction", params)
        
        Log.d(TAG, "Sent action to JS: $action")
    }
    
    private fun requestCurrentSongFromJS() {
        val params = Arguments.createMap()
        
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("musicWidgetRequestSong", params)
        
        Log.d(TAG, "Requested current song from JS")
    }
    
    @ReactMethod
    fun updateWidget(songData: ReadableMap) {
        try {
            val title = if (songData.hasKey("title")) songData.getString("title") ?: "" else ""
            val artist = if (songData.hasKey("artist")) songData.getString("artist") ?: "" else ""
            val artwork = if (songData.hasKey("artwork")) songData.getString("artwork") ?: "" else ""
            val isPlaying = if (songData.hasKey("isPlaying")) songData.getBoolean("isPlaying") else false
            
            val songInfo = SongInfo(title, artist, artwork, isPlaying)
            
            Log.d(TAG, "Updating widget with: $title - $artist, playing: $isPlaying")
            
            MusicWidgetProvider.updateWidget(reactApplicationContext, songInfo)
        } catch (e: Exception) {
            Log.e(TAG, "Error updating widget: ${e.message}")
        }
    }
    
    @ReactMethod
    fun addListener(eventName: String) {
        // Keep: Required for RN built in Event Emitter Calls.
    }
    
    @ReactMethod
    fun removeListeners(count: Integer) {
        // Keep: Required for RN built in Event Emitter Calls.
    }
}
