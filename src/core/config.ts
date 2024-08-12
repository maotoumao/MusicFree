// import {Quality} from '@/constants/commonConst';
import {CustomizedColors} from '@/hooks/useColors';
import {getStorage, setStorage} from '@/utils/storage';
import {produce} from 'immer';
import {useEffect, useState} from 'react';
import {ResumeMode, SortType} from '@/constants/commonConst.ts';

type ExceptionType = IMusic.IMusicItem | IMusic.IMusicItem[] | IMusic.IQuality;
interface IConfig {
    setting: {
        basic: {
            autoPlayWhenAppStart: boolean;
            /** 使用移动网络播放 */
            useCelluarNetworkPlay: boolean;
            /** 使用移动网络下载 */
            useCelluarNetworkDownload: boolean;
            /** 最大同时下载 */
            maxDownload: number | string;
            /** 播放歌曲行为 */
            clickMusicInSearch: '播放歌曲' | '播放歌曲并替换播放列表';
            /** 点击专辑单曲 */
            clickMusicInAlbum: '播放专辑' | '播放单曲';
            /** 下载文件夹 */
            downloadPath: string;
            /** 同时播放 */
            notInterrupt: boolean;
            /** 打断时 */
            tempRemoteDuck: '暂停' | '降低音量';
            /** 播放错误时自动停止 */
            autoStopWhenError: boolean;
            /** 插件缓存策略 todo */
            pluginCacheControl: string;
            /** 最大音乐缓存 */
            maxCacheSize: number;
            /** 默认播放音质 */
            defaultPlayQuality: IMusic.IQualityKey;
            /** 音质顺序 */
            playQualityOrder: 'asc' | 'desc';
            /** 默认下载音质 */
            defaultDownloadQuality: IMusic.IQualityKey;
            /** 下载音质顺序 */
            downloadQualityOrder: 'asc' | 'desc';
            /** 歌曲详情页 */
            musicDetailDefault: 'album' | 'lyric';
            /** 歌曲详情页常亮 */
            musicDetailAwake: boolean;
            debug: {
                errorLog: boolean;
                traceLog: boolean;
                devLog: boolean;
            };
            /** 最大历史记录条目 */
            maxHistoryLen: number;
            /** 启动时自动更新插件 */
            autoUpdatePlugin: boolean;
            // 不检查插件版本号
            notCheckPluginVersion: boolean;
            /** 关联歌词方式 */
            associateLyricType: 'input' | 'search';
            // 是否展示退出按钮
            showExitOnNotification: boolean;
            // 本地歌单添加歌曲顺序
            musicOrderInLocalSheet: SortType;
            // 自动换源
            tryChangeSourceWhenPlayFail: boolean;
        };
        /** 歌词 */
        lyric: {
            showStatusBarLyric: boolean;
            topPercent: number;
            leftPercent: number;
            align: number;
            color: string;
            backgroundColor: string;
            widthPercent: number;
            fontSize: number;
            // 详情页的字体大小
            detailFontSize: number;
            // 自动搜索歌词
            autoSearchLyric: boolean;
        };

        /** 主题 */
        theme: {
            background: string;
            backgroundOpacity: number;
            backgroundBlur: number;
            colors: CustomizedColors;
            customColors?: CustomizedColors;
            followSystem: boolean;
            selectedTheme: string;
        };

        backup: {
            resumeMode: ResumeMode;
        };

        plugin: {
            subscribeUrl: string;
        };
        webdav: {
            url: string;
            username: string;
            password: string;
        };
    };
    status: {
        music: {
            /** 当前的音乐 */
            track: IMusic.IMusicItem;
            /** 进度 */
            progress: number;
            /** 模式 */
            repeatMode: string;
            /** 列表 */
            musicQueue: IMusic.IMusicItem[];
            /** 速度 */
            rate: number;
        };
        app: {
            /** 跳过特定版本 */
            skipVersion: string;
        };
    };
}

type FilterType<T, R = never> = T extends Record<string | number, any>
    ? {
          [P in keyof T]: T[P] extends ExceptionType ? R : T[P];
      }
    : never;

type KeyPaths<
    T extends object,
    Root extends boolean = true,
    R = FilterType<T, ''>,
    K extends keyof R = keyof R,
> = K extends string | number
    ?
          | (Root extends true ? `${K}` : `.${K}`)
          | (R[K] extends Record<string | number, any>
                ? `${Root extends true ? `${K}` : `.${K}`}${KeyPaths<
                      R[K],
                      false
                  >}`
                : never)
    : never;

type KeyPathValue<T extends object, K extends string> = T extends Record<
    string | number,
    any
>
    ? K extends `${infer S}.${infer R}`
        ? KeyPathValue<T[S], R>
        : T[K]
    : never;

type KeyPathsObj<
    T extends object,
    K extends string = KeyPaths<T>,
> = T extends Record<string | number, any>
    ? {
          [R in K]: KeyPathValue<T, R>;
      }
    : never;

type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends Record<string | number, any>
        ? T[K] extends ExceptionType
            ? T[K]
            : DeepPartial<T[K]>
        : T[K];
};

export type IConfigPaths = KeyPaths<IConfig>;
type PartialConfig = DeepPartial<IConfig> | null;
type IConfigPathsObj = KeyPathsObj<DeepPartial<IConfig>, IConfigPaths>;

let config: PartialConfig = null;
/** 初始化config */
async function setup() {
    config = (await getStorage('local-config')) ?? {};
    // await checkValidPath(['setting.theme.background']);
    notify();
}

/** 设置config */
async function setConfig<T extends IConfigPaths>(
    key: T,
    value: IConfigPathsObj[T],
    shouldNotify = true,
) {
    if (config === null) {
        return;
    }
    const keys = key.split('.');

    const result = produce(config, draft => {
        draft[keys[0] as keyof IConfig] = draft[keys[0] as keyof IConfig] ?? {};
        let conf: any = draft[keys[0] as keyof IConfig];
        for (let i = 1; i < keys.length - 1; ++i) {
            if (!conf?.[keys[i]]) {
                conf[keys[i]] = {};
            }
            conf = conf[keys[i]];
        }
        conf[keys[keys.length - 1]] = value;
        return draft;
    });

    setStorage('local-config', result);
    config = result;
    if (shouldNotify) {
        notify();
    }
}

// todo: 获取兜底
/** 获取config */
function getConfig(): PartialConfig;
function getConfig<T extends IConfigPaths>(key: T): IConfigPathsObj[T];
function getConfig(key?: string) {
    let result: any = config;
    if (key && config) {
        result = getPathValue(config, key);
    }

    return result;
}

/** 通过path获取值 */
function getPathValue(obj: Record<string, any>, path: string) {
    const keys = path.split('.');
    let tmp = obj;
    for (let i = 0; i < keys.length; ++i) {
        tmp = tmp?.[keys[i]];
    }
    return tmp;
}

/** 同步hook */
const notifyCbs = new Set<() => void>();
function notify() {
    notifyCbs.forEach(_ => _?.());
}

/** hook */
function useConfig(): PartialConfig;
function useConfig<T extends IConfigPaths>(key: T): IConfigPathsObj[T];
function useConfig(key?: string) {
    // TODO: 应该有性能损失
    const [_cfg, _setCfg] = useState<PartialConfig>(config);
    function setCfg() {
        _setCfg(config);
    }
    useEffect(() => {
        notifyCbs.add(setCfg);
        return () => {
            notifyCbs.delete(setCfg);
        };
    }, []);

    if (key) {
        return _cfg ? getPathValue(_cfg, key) : undefined;
    } else {
        return _cfg;
    }
}

const Config = {
    get: getConfig,
    set: setConfig,
    useConfig,
    setup,
};

export default Config;
