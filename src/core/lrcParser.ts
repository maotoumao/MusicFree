const timeReg = /\[[\d:.]+\]/g;
const metaReg = /\[(.+)\:(.+)\]/g;

export default class LyricParser {
    private lastIndex: number = 0;
    private lrcItems: Array<ILyric.IParsedLrcItem>;
    private meta: Record<string, any>;
    private currentMusicItem?: IMusic.IMusicItem;

    constructor(raw: string, currentMusicItem?: IMusic.IMusicItem) {
        raw = raw.trim();
        this.currentMusicItem = currentMusicItem;
        const rawLrcItems: Array<ILyric.IParsedLrcItem> = [];
        const rawLrcs = raw.split(timeReg) ?? [];
        const rawTimes = raw.match(timeReg) ?? [];
        const len = rawTimes.length;

        this.meta = this.parseMeta(rawLrcs[0].trim());
        rawLrcs.shift();

        let counter = 0;
        let j, lrc;
        for (let i = 0; i < len; ++i) {
            counter = 0;
            while (rawLrcs[0] === '') {
                ++counter;
                rawLrcs.shift();
            }
            lrc = rawLrcs[0]?.trim?.() ?? '';
            for (j = i; j < i + counter; ++j) {
                rawLrcItems.push({
                    time: this.parseTime(rawTimes[j]),
                    lrc,
                });
            }
            i += counter;
            if (i < len) {
                rawLrcItems.push({
                    time: this.parseTime(rawTimes[i]),
                    lrc,
                });
            }
            rawLrcs.shift();
        }
        this.lrcItems = rawLrcItems.sort((a, b) => a.time - b.time);
        if (this.lrcItems.length === 0 && raw.length) {
            this.lrcItems = raw.split('\n').map(_ => ({
                time: 0,
                lrc: _,
            }));
        }
    }

    getPosition(position: number): {
        lrc?: ILyric.IParsedLrcItem;
        index: number;
    } {
        position = position - (this.meta?.offset ?? 0);
        let index;
        /** 最前面 */
        if (!this.lrcItems[0] || position < this.lrcItems[0].time) {
            this.lastIndex = 0;
            return {
                lrc: undefined,
                index: -1,
            };
        }
        for (
            index = this.lastIndex;
            index < this.lrcItems.length - 1;
            ++index
        ) {
            if (
                position >= this.lrcItems[index].time &&
                position < this.lrcItems[index + 1].time
            ) {
                this.lastIndex = index;
                return {
                    lrc: this.lrcItems[index],
                    index,
                };
            }
        }

        for (index = 0; index < this.lastIndex; ++index) {
            if (
                position >= this.lrcItems[index].time &&
                position < this.lrcItems[index + 1].time
            ) {
                this.lastIndex = index;
                return {
                    lrc: this.lrcItems[index],
                    index,
                };
            }
        }

        index = this.lrcItems.length - 1;
        this.lastIndex = index;
        return {
            lrc: this.lrcItems[index],
            index,
        };
    }

    getCurrentMusicItem() {
        return this.currentMusicItem;
    }

    getLyric() {
        return this.lrcItems;
    }

    getMeta() {
        return this.meta;
    }

    parseMeta(metaStr: string) {
        if (metaStr === '') {
            return {};
        }
        const metaArr = metaStr.match(metaReg) ?? [];
        const meta: any = {};
        let k, v;
        for (let m of metaArr) {
            k = m.substring(1, m.indexOf(':'));
            v = m.substring(k.length + 2, m.length - 1);
            if (k === 'offset') {
                meta[k] = +v / 1000;
            } else {
                meta[k] = v;
            }
        }
        return meta;
    }

    /** [xx:xx.xx] => x s */
    parseTime(timeStr: string): number {
        let result = 0;
        const nums = timeStr.slice(1, timeStr.length - 1).split(':');
        for (let i = 0; i < nums.length; ++i) {
            result = result * 60 + +nums[i];
        }
        return result;
    }
}
