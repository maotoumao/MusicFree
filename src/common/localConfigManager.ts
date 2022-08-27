import {getStorage, setStorage} from '@/utils/storageUtil';
import produce from 'immer';
import {useEffect, useState} from 'react';
import {exists} from 'react-native-fs';

type ExceptionType = IMusic.IMusicItem | IMusic.IMusicItem[];
interface IConfig {
  setting: {
    theme: {
      mode: 'light' | 'dark';
      background: string;
      backgroundOpacity: number;
      backgroundBlur: number;
      colors: {
        primary: string;
        placeholder: string;
        surface: string;
        text: string;
        accent: string;
        background: string;
      };
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
          ? `${Root extends true ? `${K}` : `.${K}`}${KeyPaths<R[K], false>}`
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

type IConfigPaths = KeyPaths<IConfig>;
type PartialConfig = DeepPartial<IConfig> | null;
type IConfigPathsObj = KeyPathsObj<DeepPartial<IConfig>, IConfigPaths>;

let config: PartialConfig = null;
/** 初始化config */
export async function loadConfig() {
  config = (await getStorage('local-config')) ?? {};
  // await checkValidPath(['setting.theme.background']);
  notify();
}

/** 检测合法路径 */
async function checkValidPath(paths: Array<IConfigPaths> = []) {
  return Promise.all(
    paths.map(async _ => {
      if (!(await exists(getPathValue(config ?? {}, _) as unknown as string))) {
        await setConfig(_, undefined);
      }
    }),
  );
}

/** 设置config */
export async function setConfig<T extends IConfigPaths>(
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

/** 获取config */
export function getConfig(): Promise<PartialConfig>;
export function getConfig<T extends IConfigPaths>(
  key: T,
): Promise<IConfigPathsObj[T]>;
export async function getConfig(key?: string) {
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
export function useConfig(): PartialConfig;
export function useConfig<T extends IConfigPaths>(key: T): IConfigPathsObj[T];
export function useConfig(key?: string) {
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
