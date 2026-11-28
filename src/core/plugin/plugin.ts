/**
 * Plugin 实体：pending 即可读缓存元数据，方法调用时自动懒编译（幂等记忆化 + 并发去重）
 * 无定时器、无 Initializing/Loading 中间态；纯事件驱动（首次使用触发编译）
 */
import { buildMethods } from './methods';
import { normalizeSearchTypes } from './normalizer';
import { compile, createSandboxEnv } from './sandbox';

import type {
    Plugin,
    PluginErrorReason,
    PluginMetaRecord,
    PluginMethods,
    PluginState,
} from './types';
import type { MediaType, PluginDefinition, UserVariable } from '@/types';

/** Plugin 运行期依赖（由 PluginManager 装配：源码读取来自 store，用户变量来自 meta） */
export interface PluginRuntimeDeps {
    /** 读源码（按注册表 file 名） */
    readSource(file: string): Promise<string>;
    /** 该插件的用户变量（注入沙箱 env） */
    getUserVariables(): Record<string, string>;
}

export class PluginImpl implements Plugin {
    readonly platform: string;
    readonly hash: string;
    readonly version?: string;
    readonly author?: string;
    readonly description?: string;
    readonly srcUrl?: string;
    readonly userVariables?: UserVariable[];
    readonly supportedMethods: ReadonlySet<keyof PluginMethods>;
    readonly supportedSearchTypes?: readonly MediaType[];
    readonly methods: PluginMethods;

    #state: PluginState = 'pending';
    #errorReason?: PluginErrorReason;
    #definition?: PluginDefinition;
    #loadPromise?: Promise<void>;
    readonly #file: string;
    readonly #deps: PluginRuntimeDeps;

    constructor(
        platform: string,
        meta: PluginMetaRecord,
        deps: PluginRuntimeDeps,
        initial?: { state: 'error'; errorReason: 'versionMismatch' },
    ) {
        this.platform = platform;
        this.hash = meta.hash;
        this.version = meta.version;
        this.author = meta.author;
        this.description = meta.description;
        this.srcUrl = meta.srcUrl;
        this.userVariables = meta.userVariables;
        this.supportedMethods = new Set(
            meta.supportedMethods as (keyof PluginMethods)[],
        );
        // 声明的可搜索类型（'sheet'→'playlist' 归一）；undefined = 未声明 = 支持全部（对齐 legacy）
        this.supportedSearchTypes = normalizeSearchTypes(
            meta.supportedSearchTypes,
        );
        this.#file = meta.file;
        this.#deps = deps;
        // setup 可播种初始态（如启动免编译判出的 versionMismatch）
        if (initial) {
            this.#state = initial.state;
            this.#errorReason = initial.errorReason;
        }
        this.methods = buildMethods({
            platform: this.platform,
            supportedSearchTypes: meta.supportedSearchTypes,
            getDefinition: () => this.#definition,
            ensureLoaded: () => this.load(),
        });
    }

    get state(): PluginState {
        return this.#state;
    }

    get errorReason(): PluginErrorReason | undefined {
        return this.#errorReason;
    }

    get definition(): PluginDefinition | undefined {
        return this.#definition;
    }

    /** 幂等记忆化编译：缓存 in-flight promise，并发只编译一次 */
    load(): Promise<void> {
        // 预置 versionMismatch：不编译，保持 error（其 methods 走兜底、插件不可用）
        if (
            this.#state === 'error' &&
            this.#errorReason === 'versionMismatch'
        ) {
            return Promise.resolve();
        }
        return (this.#loadPromise ??= this.#doLoad());
    }

    async #doLoad(): Promise<void> {
        try {
            const source = await this.#deps.readSource(this.#file);
            const env = createSandboxEnv(() => this.#deps.getUserVariables());
            const { definition } = compile(source, env);
            this.#definition = definition;
            this.#state = 'ready';
        } catch (e) {
            this.#state = 'error';
            this.#errorReason = 'parseError';
            throw e;
        }
    }
}
