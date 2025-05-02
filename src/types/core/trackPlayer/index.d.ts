import { State } from "react-native-track-player";
import { MusicRepeatMode } from "@/constants/repeatModeConst";

export interface ITrackPlayer {
    /**
     * 初始化音乐播放器，恢复上次播放状态
     */
    setupTrackPlayer(): Promise<void>;

    /**
     * 获取播放列表的React Hook
     * @returns 当前播放列表
     */
    usePlayList(): IMusic.IMusicItem[];

    /**
     * 获取当前播放列表
     * @returns 当前播放列表
     */
    getPlayList(): IMusic.IMusicItem[];

    /**
     * 批量添加音乐到播放列表
     * @param musicItems 要添加的音乐列表
     * @param beforeIndex 在指定位置之前添加，undefined表示添加到末尾
     * @param shouldShuffle 是否随机排序添加的音乐
     */
    addAll(
        musicItems?: Array<IMusic.IMusicItem>,
        beforeIndex?: number,
        shouldShuffle?: boolean
    ): void;

    /**
     * 添加音乐到播放列表
     * @param musicItem 单曲或音乐列表
     * @param beforeIndex 在指定位置之前添加，undefined表示添加到末尾
     */
    add(
        musicItem: IMusic.IMusicItem | IMusic.IMusicItem[],
        beforeIndex?: number
    ): void;

    /**
     * 添加音乐到下一首播放位置
     * @param musicItem 单曲或音乐列表
     */
    addNext(musicItem: IMusic.IMusicItem | IMusic.IMusicItem[]): void;

    /**
     * 跳到播放列表的下一首
     */
    skipToNext(): Promise<void>;

    /**
     * 跳到播放列表的上一首
     */
    skipToPrevious(): Promise<void>;

    /**
     * 播放指定音乐或切换播放状态
     * @param musicItem 要播放的音乐项，为空则播放/暂停当前音乐
     * @param forcePlay 是否强制从头开始播放
     */
    play(
        musicItem?: IMusic.IMusicItem | null,
        forcePlay?: boolean
    ): Promise<void>;

    /**
     * 播放指定音乐并替换整个播放列表
     * @param musicItem 要播放的音乐
     * @param newPlayList 新的播放列表
     */
    playWithReplacePlayList(
        musicItem: IMusic.IMusicItem,
        newPlayList: IMusic.IMusicItem[]
    ): Promise<void>;

    /**
     * 暂停播放
     */
    pause(): Promise<void>;

    /**
     * 从播放列表中移除指定音乐
     * @param musicItem 要移除的音乐
     */
    remove(musicItem: IMusic.IMusicItem): Promise<void>;

    /**
     * 清空播放列表并停止播放
     */
    clear(): Promise<void>;

    /**
     * 当前播放音乐的React Hook
     * @returns 当前播放的音乐
     */
    useCurrentMusic(): IMusic.IMusicItem | null;

    /**
     * 获取当前正在播放的音乐
     * @returns 当前播放的音乐
     */
    getCurrentMusic(): IMusic.IMusicItem | null;

    /**
     * 播放模式的React Hook
     * @returns 当前播放模式
     */
    useRepeatMode(): MusicRepeatMode;

    /**
     * 获取当前播放模式
     * @returns 当前播放模式
     */
    getRepeatMode(): MusicRepeatMode;

    /**
     * 切换到下一个播放模式（列表循环->随机播放->单曲循环）
     */
    toggleRepeatMode(): void;

    /**
     * 播放状态的React Hook
     */
    usePlaybackState(): {
        state: State;
        error?: string | undefined;
    };

    /**
     * 获取播放进度
     * @returns 播放进度信息
     */
    getProgress(): Promise<{ position: number; duration: number }>;

    /**
     * 播放进度的React Hook
     */
    useProgress(): {
        position: number;
        duration: number;
        buffered: number;
    };

    /**
     * 跳转到指定播放位置
     * @param position 目标播放位置（秒）
     */
    seekTo(position: number): Promise<void>;

    /**
     * 切换播放音质
     * @param newQuality 目标音质
     * @returns 是否切换成功
     */
    changeQuality(newQuality: IMusic.IQualityKey): Promise<boolean>;

    /**
     * 当前音质的React Hook
     * @returns 当前播放音质
     */
    useCurrentQuality(): IMusic.IQualityKey;

    /**
     * 获取当前播放音质
     * @returns 当前播放音质
     */
    getCurrentQuality(): IMusic.IQualityKey;

    /**
     * 获取当前播放速率
     * @returns 当前播放速率
     */
    getRate(): Promise<number>;

    /**
     * 设置播放速率
     * @param rate 播放速率
     */
    setRate(rate: number): Promise<void>;

    /**
     * 音乐播放状态的React Hook
     * @returns 当前播放状态
     */
    useMusicState(): State;

    /**
     * 重置播放器
     */
    reset(): Promise<void>;

    /**
     * 获取上一首歌曲
     * @returns 上一首歌曲，如果不存在则返回null
     */
    getPreviousMusic(): IMusic.IMusicItem | null;

    /**
     * 获取下一首歌曲
     * @returns 下一首歌曲，如果不存在则返回null
     */
    getNextMusic(): IMusic.IMusicItem | null;
}