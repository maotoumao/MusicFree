import AsyncStorage from '@react-native-async-storage/async-storage';
import produce from 'immer';
import {useEffect, useState} from 'react';

type CombineKey<R extends string, P extends any> = P extends string
  ? R extends ''
    ? P
    : `${R}.${P}`
  : never;

type KeyPaths<
  T extends object,
  Prefix extends string = '',
  R = Required<T>,
  K extends keyof R = keyof R,
> = R extends Record<string | number, any>
  ? CombineKey<Prefix, K> | KeyPaths<R[K], CombineKey<Prefix, K>>
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

interface IConfig {
  setting?: {
    background?: string;
  };
}

type IConfigPaths = KeyPaths<IConfig>;
type IConfigPathsObj = KeyPathsObj<IConfig>;

let config: IConfig | null = null;
/** 初始化config */
export async function loadConfig() {
  try {
    const _ = await AsyncStorage.getItem('local-config');
    if (!_) {
      throw new Error();
    }
    config = JSON.parse(_);
  } catch {
    config = {};
  }
  notify();
}

/** 设置config */
export async function setConfig<T extends IConfigPaths>(
  key: T,
  value: IConfigPathsObj[T],
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

  try {
    await AsyncStorage.setItem('local-config', JSON.stringify(result));
    config = result;
    notify();
  } catch {}
}

/** 获取config */
export function getConfig(): Promise<IConfig | null>;
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
    tmp = obj?.[keys[i]];
  }
  return tmp;
}

/** 同步hook */
const notifyCbs = new Set<() => void>();
function notify() {
  notifyCbs.forEach(_ => _?.());
}

/** hook */
export function useConfig(): IConfig | null;
export function useConfig<T extends IConfigPaths>(key: T): IConfigPathsObj[T];
export function useConfig(key?: string) {
  const [_cfg, _setCfg] = useState<IConfig | null>(config);
  function setCfg() {
    console.log('configis', config);
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
