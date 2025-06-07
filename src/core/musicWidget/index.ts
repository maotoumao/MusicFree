import { useEffect } from 'react';
import { AppState } from 'react-native';
import MusicWidgetModule, { eventEmitter } from '@/native/musicWidget';
import TrackPlayer from '@/core/trackPlayer';
import ReactNativeTrackPlayer, { State, Event } from 'react-native-track-player';
import { TrackPlayerEvents } from '@/core.defination/trackPlayer';

class MusicWidgetService {
    private static instance: MusicWidgetService;
    
    private constructor() {
        this.setupEventListeners();
    }
    
    public static getInstance(): MusicWidgetService {
        if (!MusicWidgetService.instance) {
            MusicWidgetService.instance = new MusicWidgetService();
        }
        return MusicWidgetService.instance;
    }    private setupEventListeners() {
        // 监听小部件控制事件
        eventEmitter.addListener('musicWidgetAction', (data) => {
            this.handleWidgetAction(data.action);
        });
        
        // 监听小部件请求当前歌曲信息
        eventEmitter.addListener('musicWidgetRequestSong', () => {
            this.updateWidget();
        });
        
        // 监听TrackPlayer状态变化
        TrackPlayer.on(TrackPlayerEvents.CurrentMusicChanged, () => {
            this.updateWidget();
        });
        
        // 监听播放器状态变化 (play/pause)
        ReactNativeTrackPlayer.addEventListener(Event.PlaybackState, () => {
            // 延迟更新，确保状态已经更新
            setTimeout(() => {
                this.updateWidget();
            }, 100);
        });
        
        // 监听应用进入后台/前台，确保小部件状态同步
        AppState.addEventListener('change', (nextAppState) => {
            if (nextAppState === 'active') {
                // 应用回到前台时更新小部件
                this.updateWidget();
            }
        });
    }
      private async handleWidgetAction(action: string) {
        try {
            switch (action) {
                case 'previous':
                    await TrackPlayer.skipToPrevious();
                    break;
                case 'playpause':
                    const currentMusic = TrackPlayer.currentMusic;
                    if (currentMusic) {
                        const state = await ReactNativeTrackPlayer.getPlaybackState();
                        if (state.state === State.Playing) {
                            await TrackPlayer.pause();
                        } else {
                            await TrackPlayer.play();
                        }
                    }
                    break;
                case 'next':
                    await TrackPlayer.skipToNext();
                    break;
            }
        } catch (error) {
            console.error('Widget action error:', error);
        }
    }
      public async updateWidget() {
        try {
            const currentMusic = TrackPlayer.currentMusic;
            const state = await ReactNativeTrackPlayer.getPlaybackState();
            const isPlaying = state.state === State.Playing;
            
            const songData = {
                title: currentMusic?.title || '',
                artist: currentMusic?.artist || '',
                artwork: currentMusic?.artwork || '',
                isPlaying: isPlaying
            };
            
            MusicWidgetModule.updateWidget(songData);
        } catch (error) {
            console.error('Update widget error:', error);
        }
    }
}

// Hook for component usage
export function useMusicWidget() {
    useEffect(() => {
        const widgetService = MusicWidgetService.getInstance();
        
        // Initial update
        widgetService.updateWidget();
        
        return () => {
            // Cleanup if needed
        };
    }, []);
}

export default MusicWidgetService;
