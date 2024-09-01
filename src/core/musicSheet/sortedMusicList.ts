import {SortType} from '@/constants/commonConst.ts';
import {isSameMediaItem} from '@/utils/mediaItem.ts';
import {createMediaIndexMap} from '@/utils/mediaIndexMap.ts';

// Bug: localeCompare is slow sometimes https://github.com/facebook/hermes/issues/867
const collator = new Intl.Collator('zh');

/// Compare Functions

const compareTitle = (a: IMusic.IMusicItem, b: IMusic.IMusicItem) =>
    collator.compare(a.title, b.title);
const compareArtist = (a: IMusic.IMusicItem, b: IMusic.IMusicItem) =>
    collator.compare(a.artist, b.artist);
const compareAlbum = (a: IMusic.IMusicItem, b: IMusic.IMusicItem) =>
    collator.compare(a.album, b.album);
const compareTimeNewToOld = (b: IMusic.IMusicItem, a: IMusic.IMusicItem) => {
    const timestamp = (a.$timestamp || 0) - (b.$timestamp || 0);
    if (timestamp === 0) {
        return (a.$sortIndex || 0) - (b.$sortIndex || 0);
    } else {
        return timestamp;
    }
};

const compareTimeOldToNew = (a: IMusic.IMusicItem, b: IMusic.IMusicItem) => {
    const timestamp = (a.$timestamp || 0) - (b.$timestamp || 0);
    if (timestamp === 0) {
        return (a.$sortIndex || 0) - (b.$sortIndex || 0);
    } else {
        return timestamp;
    }
};

const compareFunctionMap = {
    [SortType.Title]: compareTitle,
    [SortType.Artist]: compareArtist,
    [SortType.Album]: compareAlbum,
    [SortType.Newest]: compareTimeNewToOld,
    [SortType.Oldest]: compareTimeOldToNew,
} as const;

export default class SortedMusicList {
    private array: IMusic.IMusicItem[] = [];

    private sortType: SortType = SortType.None;

    private countMap = new Map<string, Set<string>>();

    get musicList() {
        return this.array;
    }

    get firstMusic() {
        return this.array[0] || null;
    }

    get platforms() {
        return [...this.countMap.keys()];
    }

    get length() {
        return this.array.length;
    }

    constructor(
        musicItems: IMusic.IMusicItem[],
        sortType = SortType.None,
        skipInitialSort = false,
    ) {
        this.array = [...musicItems];
        this.addToCountMap(this.array);
        this.sortType = sortType;

        if (!skipInitialSort) {
            this.resort();
        }
    }

    at(index: number) {
        return this.array[index] || null;
    }

    has(musicItem: IMusic.IMusicItem | null) {
        if (!musicItem) {
            return false;
        }
        const platform = musicItem.platform.toString();
        const id = musicItem.id.toString();

        return this.countMap.get(platform)?.has(id) || false;
    }

    // 设置排序类型
    setSortType(sortType: SortType) {
        if (
            this.sortType === sortType &&
            this.sortType !== SortType.None &&
            this.sortType
        ) {
            return;
        }
        this.sortType = sortType;
        this.resort();
    }

    manualSort(newMusicItems: IMusic.IMusicItem[]) {
        this.array = newMusicItems;
        this.sortType = SortType.None;
    }

    add(musicItems: IMusic.IMusicItem[]) {
        musicItems = musicItems.filter(it => !this.has(it));
        if (!musicItems.length) {
            return 0;
        }
        this.addToCountMap(musicItems);

        if (!compareFunctionMap[this.sortType]) {
            this.array = musicItems.concat(this.array);
            return musicItems.length;
        }

        // 如果歌单内歌曲比较少
        if (
            this.array.length + musicItems.length < 500 ||
            musicItems.length / (this.array.length + 1) > 10
        ) {
            this.array = musicItems.concat(this.array);
            this.resort();
            return musicItems.length;
        }
        // 如果歌单内歌曲比较多
        musicItems.sort(compareFunctionMap[this.sortType]);
        this.array = this.mergeArray(musicItems, this.array, this.sortType);
        return musicItems.length;
    }

    remove(musicItems: IMusic.IMusicItem[]) {
        const indexMap = createMediaIndexMap(musicItems);

        this.array = this.array.filter(it => !indexMap.has(it));
        this.removeFromCountMap(musicItems);
    }

    removeByIndex(indices: number[]) {
        const indicesSet = new Set(indices);
        const removedItems: IMusic.IMusicItem[] = [];

        this.array = this.array.filter((it, index) => {
            if (indicesSet.has(index)) {
                removedItems.push(it);
                return false;
            }
            return true;
        });

        this.removeFromCountMap(removedItems);
    }

    clearAll() {
        this.array = [];
    }

    private addToCountMap(musicItems: IMusic.IMusicItem[]) {
        for (let musicItem of musicItems) {
            const platform = musicItem.platform.toString();
            const id = musicItem.id.toString();

            if (this.countMap.has(platform)) {
                this.countMap.get(platform)!.add(id);
            } else {
                this.countMap.set(platform, new Set([id]));
            }
        }
    }

    private removeFromCountMap(musicItems: IMusic.IMusicItem[]) {
        for (let musicItem of musicItems) {
            const platform = musicItem.platform.toString();
            const id = musicItem.id.toString();

            if (this.countMap.has(platform)) {
                const set = this.countMap.get(platform)!;
                set.delete(id);
                if (set.size === 0) {
                    this.countMap.delete(platform);
                }
            }
        }
    }

    /**
     * 合并两个有序列表
     * @param musicList1
     * @param musicList2
     * @param sortType
     * @private
     */
    private mergeArray(
        musicList1: IMusic.IMusicItem[],
        musicList2: IMusic.IMusicItem[],
        sortType: SortType,
    ) {
        // 无序
        const compareFn = compareFunctionMap[sortType];

        if (!compareFn) {
            return musicList1.concat(musicList2);
        }

        let [p1, p2] = [0, 0];
        let resultArray: IMusic.IMusicItem[] = [];
        let peek1: IMusic.IMusicItem, peek2: IMusic.IMusicItem;
        while (p1 < musicList1.length && p2 < musicList2.length) {
            peek1 = musicList1[p1];
            peek2 = musicList2[p2];

            if (compareFn(peek1, peek2) < 0) {
                resultArray.push(peek1);
                ++p1;
            } else {
                resultArray.push(peek2);
                ++p2;
            }
        }

        if (p1 < musicList1.length) {
            return resultArray.concat(musicList1.slice(p1));
        }
        if (p2 < musicList2.length) {
            return resultArray.concat(musicList2.slice(p2));
        }

        return resultArray;
    }

    /**
     * 寻找musicItem
     * @param musicItem
     * @private
     */
    public findIndex(musicItem: IMusic.IMusicItem) {
        if (!compareFunctionMap[this.sortType]) {
            return this.array.find(it => isSameMediaItem(it, musicItem));
        }
        let [left, right] = [0, this.array.length];
        let mid: number;

        while (left < right) {
            mid = Math.floor((left + right) / 2);
            let compareResult = compareFunctionMap[this.sortType](
                this.array[mid],
                musicItem,
            );

            if (compareResult < 0) {
                left = mid + 1;
            } else if (compareResult === 0) {
                left = mid;
                break;
            } else {
                right = mid;
            }
        }

        return left === right ? -1 : left;
    }

    // 重新排序
    private resort() {
        const compareFn = compareFunctionMap[this.sortType];

        if (!compareFn) {
            return;
        }
        this.array.sort(compareFn);
        this.array = [...this.array];
        return;
    }
}
