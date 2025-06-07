import { NativeModule, NativeModules, NativeEventEmitter } from 'react-native';

interface IMusicWidgetModule extends NativeModule {
    updateWidget: (songData: {
        title: string;
        artist: string;
        artwork: string;
        isPlaying: boolean;
    }) => void;
    addListener: (eventName: string) => void;
    removeListeners: (count: number) => void;
}

const MusicWidgetModule = NativeModules.MusicWidgetModule;
const eventEmitter = new NativeEventEmitter(MusicWidgetModule);

export default MusicWidgetModule as IMusicWidgetModule;
export { eventEmitter };
