import { NativeModules } from "react-native";

export interface IBasicMeta {
    album?: string;
    artist?: string;
    author?: string;
    duration?: string;
    title?: string;
}

export interface IWritableMeta extends IBasicMeta {
    lyric?: string;
    comment?: string;
}

interface IMp3Util {
    getBasicMeta: (fileName: string) => Promise<IBasicMeta>;
    getMediaMeta: (fileNames: string[]) => Promise<IBasicMeta[]>;
    getMediaCoverImg: (mediaPath: string) => Promise<string>;
    /** 读取内嵌歌词 */
    getLyric: (mediaPath: string) => Promise<string>;
    /** 写入meta信息 */
    setMediaTag: (filePath: string, meta: IWritableMeta) => Promise<void>;
    getMediaTag: (filePath: string) => Promise<IWritableMeta>;
}

const Mp3Util = NativeModules.Mp3Util;

export default Mp3Util as IMp3Util;
