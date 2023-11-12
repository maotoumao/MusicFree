import {NativeModule, NativeModules} from 'react-native';

// 状态栏歌词的工具
interface ILyricUtil extends NativeModule {
    /** 显示状态栏歌词 */
    showStatusBarLyric: (initLyric?: string) => Promise<void>;
    /** 隐藏状态栏歌词 */
    hideStatusBarLyric: () => Promise<void>;
}

const LyricUtil: ILyricUtil = NativeModules.LyricUtil;

export default LyricUtil;
