import type { Progress } from "react-native-track-player";
import type { MusicRepeatMode } from "@/constants/repeatModeConst";
import { IInjectable } from "@/types/infra";
import type EventEmitter from "eventemitter3";
import type { TrackPlayerEvents } from "@/core.defination/trackPlayer";

export interface ITrackPlayer extends IInjectable, EventEmitter<{
    [TrackPlayerEvents.PlayEnd]: () => void;
    [TrackPlayerEvents.CurrentMusicChanged]: (musicItem: IMusic.IMusicItem | null) => void;
    [TrackPlayerEvents.ProgressChanged]: (progress: {
        position: number;
        duration: number;
    }) => void;
}> {
    /**
     * 上一首歌曲
     */
    readonly previousMusic: IMusic.IMusicItem | null;

    /**
     * 当前播放的歌曲
     */
    readonly currentMusic: IMusic.IMusicItem | null;

    /**
     * 下一首歌曲
     */
    readonly nextMusic: IMusic.IMusicItem | null;

    /**
     * 当前播放模式
     */
    readonly repeatMode: MusicRepeatMode;

    /**
     * 当前播放音质
     */
    readonly quality: IMusic.IQualityKey;

    /**
     * 当前播放列表
     */
    readonly playList: IMusic.IMusicItem[];

    /**
     * 初始化音乐播放器，恢复上次播放状态
     */
    setupTrackPlayer(): Promise<void>;

    /**
     * 获取音乐在播放列表中的索引
     * @param musicItem 要查找的音乐项
     * @returns 索引值，如不存在则返回-1
     */
    getMusicIndexInPlayList(musicItem?: IMusic.IMusicItem | null): number;

    /**
     * 判断音乐是否在播放列表中
     * @param musicItem 要查找的音乐项
     * @returns 是否存在于播放列表
     */
    isInPlayList(musicItem?: IMusic.IMusicItem | null): boolean;

    /**
     * 获取播放列表中指定索引的音乐
     * @param index 索引，支持循环索引（负数或超出长度会自动取模）
     * @returns 音乐项或null（如果列表为空）
     */
    getPlayListMusicAt(index: number): IMusic.IMusicItem | null;

    /**
     * 判断播放列表是否为空
     * @returns 播放列表是否为空
     */
    isPlayListEmpty(): boolean;

    /**
     * 批量添加音乐到播放列表
     * @param musicItems 要添加的音乐列表
     * @param beforeIndex 在指定位置之前添加，undefined表示添加到末尾
     * @param shouldShuffle 是否随机排序添加的音乐
     */
    addAll(
        musicItems: Array<IMusic.IMusicItem>,
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
     * 从播放列表中移除指定音乐
     * @param musicItem 要移除的音乐
     */
    remove(musicItem: IMusic.IMusicItem): Promise<void>;

    /**
     * 判断指定音乐是否是当前播放的音乐
     * @param musicItem 要判断的音乐
     * @returns 是否是当前音乐
     */
    isCurrentMusic(musicItem?: IMusic.IMusicItem | null): boolean;

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
     * 切换到下一个播放模式（列表循环->随机播放->单曲循环）
     */
    toggleRepeatMode(): void;

    /**
     * 清空播放列表并停止播放
     */
    clearPlayList(): Promise<void>;

    /**
     * 切换播放音质
     * @param newQuality 目标音质
     * @returns 是否切换成功
     */
    changeQuality(newQuality: IMusic.IQualityKey): Promise<boolean>;

    /**
     * 获取当前播放进度
     * @returns 包含播放位置和总时长的对象
     */
    getProgress(): Promise<Progress>;

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
     * 跳转到指定播放位置
     * @param position 目标位置（秒）
     */
    seekTo(position: number): Promise<void>;
}