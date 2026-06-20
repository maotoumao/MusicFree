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

    // 历史歌单的版本号
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

    // 性能服务是否存在
    get telemetryAvailable(): boolean {
        const available = this.getAppMeta("TelemetryAvailable");
        return available === "true";
    }

    setTelemetryAvailable(available: boolean) {
        this.setAppMeta("TelemetryAvailable", available ? "true" : "false");
    }

    // 上次检测性能服务是否存在的时间戳
    get telemetryCheckTimestamp(): number {
        const timestamp = this.getAppMeta("TelemetryCheckTimestamp");
        if (timestamp?.length) {
            return +timestamp;
        }
        return 0;
    }

    setTelemetryCheckTimestamp(timestamp: number) {
        this.setAppMeta("TelemetryCheckTimestamp", "" + timestamp);
    }
}

const appMeta = new AppMeta();
export default appMeta;