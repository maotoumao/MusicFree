/**
 * 插件沙箱：Function eval 编译插件源码，注入生态硬契约库集
 * compile() 无自持业务状态（会执行插件顶层代码）；注入的 axios 是隔离实例（不污染全局），对插件开发者 API 与 legacy 完全一致
 */
import axios, {
    AxiosHeaders,
    type AxiosAdapter,
    type AxiosInstance,
    type CreateAxiosDefaults,
    type InternalAxiosRequestConfig,
} from 'axios';
import bigInt from 'big-integer';
import * as cheerio from 'cheerio';
import CryptoJS from 'crypto-js';
import dayjs from 'dayjs';
import he from 'he';
import qs from 'qs';
import { URL as PolyfillURL } from 'react-native-url-polyfill';
import * as webdav from 'webdav';

import { appVersion, os } from '@/infra/device';

import { deprecatedMethodFallbacks } from './normalizer';

import type { PluginMethods } from './types';
import type { PluginDefinition } from '@/types';

/**
 * 判断请求是否显式携带了 Cookie 头（大小写不敏感；排除 `{ Cookie: undefined }` 等空占位）
 */
function hasExplicitCookie(
    headers: InternalAxiosRequestConfig['headers'],
): boolean {
    const cookie = AxiosHeaders.from(headers).get('cookie');
    return cookie !== undefined && cookie !== null && cookie !== false;
}

/**
 * RN 的 XMLHttpRequest 默认 `withCredentials = true`，原生层（Android OkHttp BridgeInterceptor /
 * iOS RCTNetworking）会在系统 CookieJar 非空时覆盖或污染请求头里的显式 Cookie（#670）。
 * 当插件显式传了 Cookie 且未主动指定 `withCredentials` 时，自动置为 `false` 旁路原生 CookieJar
 */
function applyCookieCredentialsPolicy(
    config: InternalAxiosRequestConfig,
): InternalAxiosRequestConfig {
    if (
        config.withCredentials === undefined &&
        hasExplicitCookie(config.headers)
    ) {
        config.withCredentials = false;
    }
    return config;
}

function createPluginAdapter(
    baseAdapter?: CreateAxiosDefaults['adapter'],
): AxiosAdapter {
    return (config: InternalAxiosRequestConfig) => {
        applyCookieCredentialsPolicy(config);
        const resolveAdapter = axios.getAdapter as (
            adapters: CreateAxiosDefaults['adapter'],
            requestConfig?: InternalAxiosRequestConfig,
        ) => AxiosAdapter;
        return resolveAdapter(
            baseAdapter ?? axios.defaults.adapter,
            config,
        )(config);
    };
}

function configurePluginAxiosInstance<T extends AxiosInstance>(
    instance: T,
    baseAdapter?: CreateAxiosDefaults['adapter'],
): T {
    instance.defaults.adapter = createPluginAdapter(baseAdapter);
    instance.interceptors.request.use(applyCookieCredentialsPolicy);
    // set-cookie 归一：移动端常把多个 cookie 塑进数组首元，拆回数组
    instance.interceptors.response.use(response => {
        const headers = response.headers as Record<string, unknown>;
        const setCookie = headers['set-cookie'];
        if (Array.isArray(setCookie) && setCookie.length === 1) {
            headers['set-cookie'] = String(setCookie[0]).split(',');
            headers['x-set-cookie'] = setCookie;
        }
        return response;
    });
    instance.create = (config?: CreateAxiosDefaults) =>
        configurePluginAxiosInstance(
            axios.create({ timeout: 2000, ...config }),
            config?.adapter,
        );
    return instance;
}

/**
 * 插件专用 axios 实例：隔离配置，绝不改全局 axios（app 自身网络层也 import axios，勿被插件的 2s 误伤）
 * 对插件开发者 API 完全一致：显式补齐全部静态成员 + 包装 create 让子实例同样继承超时与拦截策略
 */
function createPluginAxios(): typeof axios {
    const instance = configurePluginAxiosInstance(
        axios.create({ timeout: 2000 }) as typeof axios,
    );
    // 显式补齐全部静态成员（对照 AxiosStatic），保插件 API 与 legacy 一致
    instance.Axios = axios.Axios;
    instance.AxiosError = axios.AxiosError;
    instance.CanceledError = axios.CanceledError;
    instance.Cancel = axios.Cancel;
    instance.CancelToken = axios.CancelToken;
    instance.isCancel = axios.isCancel;
    instance.isAxiosError = axios.isAxiosError;
    instance.all = axios.all;
    instance.spread = axios.spread;
    instance.toFormData = axios.toFormData;
    instance.formToJSON = axios.formToJSON;
    instance.getAdapter = axios.getAdapter;
    instance.mergeConfig = axios.mergeConfig;
    instance.AxiosHeaders = axios.AxiosHeaders;
    instance.HttpStatusCode = axios.HttpStatusCode;
    // VERSION 在 AxiosStatic 里是 readonly，赋值需断言
    (instance as { VERSION: string }).VERSION = axios.VERSION;
    // wire：require('axios').default 取库（default 不在 AxiosStatic 里，需断言）
    (instance as { default?: unknown }).default = instance;
    return instance;
}

const pluginAxios = createPluginAxios();

/** 编译沙箱环境：由 createSandboxEnv 按插件用户变量 + appVersion 装配 */
export interface SandboxEnv {
    getUserVariables(): Record<string, string>;
    readonly userVariables: Record<string, string>;
    appVersion: string;
    os: 'android' | 'ios';
    lang: string;
}

/**
 * 装配沙箱环境：install 编译取元数据 与 PluginImpl.load 共用（env 形状单一源）
 * getUserVariables 由调用方注入（install 时 platform 未知，传 () => ({})）
 */
export function createSandboxEnv(
    getUserVariables: () => Record<string, string>,
): SandboxEnv {
    return {
        getUserVariables,
        get userVariables() {
            return getUserVariables();
        },
        appVersion,
        os,
        // TODO lang 暂固定 zh-CN；未来读 i18n localeAtom（用户所选界面语言，非设备系统语言）
        lang: 'zh-CN',
    };
}

export interface CompileResult {
    definition: PluginDefinition;
    /** definition 实际实现的归口方法名（免运行时反复探测；能力过滤 / 免编译用） */
    supportedMethods: string[];
}

/** RN 无 cookie 管理概念：插件调用降级为 no-op */
const cookieShim = {
    get: () => undefined,
    set: () => undefined,
    flush: () => undefined,
};

/** 生态硬契约：插件 `require` 的库集（全 MIT → AGPL 兼容） */
const injectedModules: Record<string, unknown> = {
    cheerio,
    'crypto-js': CryptoJS,
    axios: pluginAxios,
    dayjs,
    'big-integer': bigInt,
    qs,
    he,
    webdav,
    '@react-native-cookies/cookies': cookieShim,
};

/** 归口方法名：探测 definition 实现了哪些 */
const METHOD_NAMES: (keyof PluginMethods)[] = [
    'search',
    'getMediaSource',
    'getMusicInfo',
    'getLyric',
    'getAlbumInfo',
    'getArtistWorks',
    'getPlaylistInfo',
    'getTopLists',
    'getTopListDetail',
    'getRecommendPlaylistTags',
    'getRecommendPlaylistsByTag',
    'getMusicComments',
    'importMusicItem',
    'importPlaylist',
];

/** 插件源码只应 require 注入库集；未知模块直接抛错 */
function pluginRequire(name: string): unknown {
    if (Object.prototype.hasOwnProperty.call(injectedModules, name)) {
        const pkg = injectedModules[name];
        // legacy 兼容：插件常 require('x').default 取库，给包回填 .default 指自身
        // 对象与函数型库都覆盖（dayjs/big-integer 是函数）；只写可扩展目标，避免冻结 namespace 抛错
        if (
            (typeof pkg === 'object' || typeof pkg === 'function') &&
            pkg &&
            Object.isExtensible(pkg)
        ) {
            (pkg as Record<string, unknown>).default ??= pkg;
        }
        return pkg;
    }
    throw new Error(`[plugin] 不支持的模块: ${name}`);
}

/** 沙箱 console：转发到全局 console，加前缀；非 DEV 静默 log/info/debug */
const consoleShim = {
    log: (...args: unknown[]) => __DEV__ && console.log('[plugin]', ...args),
    info: (...args: unknown[]) => __DEV__ && console.info('[plugin]', ...args),
    debug: (...args: unknown[]) =>
        __DEV__ && console.debug('[plugin]', ...args),
    warn: (...args: unknown[]) => console.warn('[plugin]', ...args),
    error: (...args: unknown[]) => console.error('[plugin]', ...args),
};

type PluginFactory = (
    require: typeof pluginRequire,
    __musicfree_require: typeof pluginRequire,
    module: { exports: unknown },
    exports: unknown,
    console: typeof consoleShim,
    env: SandboxEnv,
    URL: typeof PolyfillURL,
    process: unknown,
) => void;

/**
 * 编译插件源码为 definition
 * @throws 源码语法错 / 求值抛错 / 无有效 platform 时抛
 */
export function compile(source: string, env: SandboxEnv): CompileResult {
    const module_: { exports: unknown } = { exports: {} };
    const process_ = {
        platform: env.os,
        version: env.appVersion,
        // legacy 契约：process.env 指向 musicfree env（非字符串表）
        env,
    };

    // eslint-disable-next-line no-new-func
    const factory = Function(
        "'use strict';return function(require,__musicfree_require,module,exports,console,env,URL,process){" +
            source +
            '\n}',
    )() as PluginFactory;

    factory(
        pluginRequire,
        pluginRequire,
        module_,
        module_.exports,
        consoleShim,
        env,
        PolyfillURL,
        process_,
    );

    const exported = module_.exports as
        | (PluginDefinition & { default?: PluginDefinition })
        | undefined;
    const definition = (exported?.default ?? exported) as
        | PluginDefinition
        | undefined;

    if (
        !definition ||
        typeof definition.platform !== 'string' ||
        !definition.platform
    ) {
        throw new Error('[plugin] 无有效 platform');
    }

    const record = definition as unknown as Record<string, unknown>;
    // 先收直接实现的规范名，再把只实现 deprecated 旧名的能力归到规范名
    const supported = new Set<keyof PluginMethods>(
        METHOD_NAMES.filter(name => typeof record[name] === 'function'),
    );
    for (const [canonical, deprecatedName] of Object.entries(
        deprecatedMethodFallbacks,
    )) {
        if (typeof record[deprecatedName] === 'function') {
            supported.add(canonical as keyof PluginMethods);
        }
    }
    const supportedMethods = METHOD_NAMES.filter(name => supported.has(name));

    return { definition, supportedMethods };
}
