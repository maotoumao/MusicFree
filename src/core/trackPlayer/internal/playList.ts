import PersistStatus from '@/core/persistStatus';
import {GlobalState} from '@/utils/stateMapper';

/** 音乐队列 */
const playListStore = new GlobalState<IMusic.IMusicItem[]>([]);

/** 下标映射 */
let playListIndexMap: Record<string, Record<string, number>> = {};

/**
 * 设置播放队列
 * @param newPlayList 新的播放队列
 * @param shouldSave 是否保存到本地
 */
export function setPlayList(
    newPlayList: IMusic.IMusicItem[],
    shouldSave = true,
) {
    playListStore.setValue(newPlayList);
    const newIndexMap: Record<string, Record<string, number>> = {};
    newPlayList.forEach((item, index) => {
        // 映射中不存在
        if (!newIndexMap[item.platform]) {
            newIndexMap[item.platform] = {
                [item.id]: index,
            };
        } else {
            // 修改映射
            newIndexMap[item.platform][item.id] = index;
        }
    });
    playListIndexMap = newIndexMap;
    if (shouldSave) {
        PersistStatus.set('music.playList', newPlayList);
    }
}

/**
 * 获取当前的播放队列
 */
export const getPlayList = playListStore.getValue;

/**
 * hook
 */
export const usePlayList = playListStore.useValue;

/**
 * 寻找歌曲在播放列表中的下标
 * @param musicItem 音乐
 * @returns 下标
 */
export function getMusicIndex(musicItem?: IMusic.IMusicItem | null) {
    if (!musicItem) {
        return -1;
    }
    return playListIndexMap[musicItem.platform]?.[musicItem.id] ?? -1;
}

/**
 * 歌曲是否在播放队列中
 * @param musicItem 音乐
 * @returns 是否在播放队列中
 */
export function isInPlayList(musicItem?: IMusic.IMusicItem | null) {
    if (!musicItem) {
        return false;
    }

    return playListIndexMap[musicItem.platform]?.[musicItem.id] > -1;
}

/**
 * 获取第i个位置的歌曲
 * @param index 下标
 */
export function getPlayListMusicAt(index: number): IMusic.IMusicItem | null {
    const playList = playListStore.getValue();
    const len = playList.length;
    if (len === 0) {
        return null;
    }

    return playList[(index + len) % len];
}

/**
 * 播放队列是否为空
 * @returns
 */
export function isPlayListEmpty() {
    return playListStore.getValue().length === 0;
}
