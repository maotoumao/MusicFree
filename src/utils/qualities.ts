/**
 * 音质相关的所有工具代码
 */

export const qualityKeys: IMusic.IQualityKey[] = [
    'low',
    'standard',
    'high',
    'super',
];

export const qualityText = {
    low: '低音质',
    standard: '标准音质',
    high: '高音质',
    super: '超高音质',
};

/** 获取音质信息 */
export function getQuality(
    qualities: IMusic.IQuality,
    qualityKey: IMusic.IQualityKey,
    sort: 'asc' | 'desc',
) {
    const quality = qualities[qualityKey];
    if (quality) {
        return quality;
    }
    const idx = qualityKeys.indexOf(qualityKey);
    const left = qualityKeys.slice(0, idx);
    const right = qualityKeys.slice(idx + 1);
    /** 优先选择音质更高的 */
    if (sort === 'asc') {
        for (let i = 0; i < right.length; ++i) {
            if (qualities[right[i]]) {
                return qualities[right[i]];
            }
        }
        for (let i = left.length - 1; i >= 0; --i) {
            if (qualities[left[i]]) {
                return qualities[left[i]];
            }
        }
    }
    /** 优先选择音质更低的 */
    if (sort === 'desc') {
        for (let i = left.length - 1; i >= 0; --i) {
            if (qualities[left[i]]) {
                return qualities[left[i]];
            }
        }
        for (let i = 0; i < right.length; ++i) {
            if (qualities[right[i]]) {
                return qualities[right[i]];
            }
        }
    }
}

/** 获取音质url */
export function getQualityUrl(
    qualities: IMusic.IQuality,
    qualityKey: IMusic.IQualityKey,
    sort: 'asc' | 'desc',
) {
    const quality = qualities[qualityKey];
    if (quality?.url) {
        return quality.url;
    }
    const idx = qualityKeys.indexOf(qualityKey);
    const left = qualityKeys.slice(0, idx);
    const right = qualityKeys.slice(idx + 1);
    /** 优先选择音质更高的 */
    if (sort === 'asc') {
        for (let i = 0; i < right.length; ++i) {
            if (qualities[right[i]]?.url) {
                return qualities[right[i]].url;
            }
        }
        for (let i = left.length - 1; i >= 0; --i) {
            if (qualities[left[i]]?.url) {
                return qualities[left[i]].url;
            }
        }
    }
    /** 优先选择音质更低的 */
    if (sort === 'desc') {
        for (let i = left.length - 1; i >= 0; --i) {
            if (qualities[left[i]]?.url) {
                return qualities[left[i]].url;
            }
        }
        for (let i = 0; i < right.length; ++i) {
            if (qualities[right[i]]?.url) {
                return qualities[right[i]].url;
            }
        }
    }
}

/** 获取musicItem的音质类型 */
export function getMusicItemQuality(
    musicItem: IMusic.IMusicItem,
): IMusic.IQualityKey {
    if (musicItem?.qualities) {
        for (let i = 0; i < qualityKeys.length; ++i) {
            if (musicItem.qualities[qualityKeys[i]]?.url === musicItem.url) {
                return qualityKeys[i];
            }
        }
    }
    return 'standard';
}
