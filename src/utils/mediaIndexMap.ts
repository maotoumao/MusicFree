interface IIndexMap {
    getIndexMap: () => Record<string, Record<string, number>>;
    getIndex: (musicItem: IMusic.IMusicItem) => number;
    has: (mediaItem: IMusic.IMusicItem) => boolean;
}

export function createMediaIndexMap(
    musicItems: IMusic.IMusicItem[],
): IIndexMap {
    const indexMap: Record<string, Record<string, number>> = {};

    musicItems.forEach((item, index) => {
        // 映射中不存在
        if (!indexMap[item.platform]) {
            indexMap[item.platform] = {
                [item.id]: index,
            };
        } else {
            // 修改映射
            indexMap[item.platform][item.id] = index;
        }
    });

    function getIndexMap() {
        return indexMap;
    }

    function getIndex(musicItem: IMusic.IMusicItem) {
        if (!musicItem) {
            return -1;
        }
        return indexMap[musicItem.platform]?.[musicItem.id] ?? -1;
    }

    function has(musicItem: IMusic.IMusicItem) {
        if (!musicItem) {
            return false;
        }

        return indexMap[musicItem.platform]?.[musicItem.id] > -1;
    }

    return {
        getIndexMap,
        getIndex,
        has,
    };
}
