import getOrCreateMMKV from "@/utils/getOrCreateMMKV";

class AppMeta {
    private getAppMeta(key: string) {
        const metaMMKV = getOrCreateMMKV("App.meta");

        return metaMMKV.getString(key);
    }
    private setAppMeta(key: string, value: any) {
        const metaMMKV = getOrCreateMMKV("App.meta");

        return metaMMKV.set(key, value);
    }


    /// 歌单的版本号
    get musicSheetVersion(): number {
        const version = this.getAppMeta("MusicSheetVersion");
        if (version?.length) {
            return +version;
        }
        return 0;
    }

    setMusicSheetVersion(version: number) {
        this.setAppMeta("MusicSheetVersion", "" + version);
    }

    get historySheetVersion(): number {
        const version = this.getAppMeta("HistorySheetVersion");
        if (version?.length) {
            return +version;
        }
        return 0;
    }

    setHistorySheetVersion(version: number) {
        this.setAppMeta("HistorySheetVersion", "" + version);
    }
}

const appMeta = new AppMeta();
export default appMeta;