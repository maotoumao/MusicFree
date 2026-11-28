/** JSON.parse 包一层：失败或空返回 undefined（不抛） */
export function safeParse<T>(text: string | undefined | null): T | undefined {
    if (text == null) {
        return undefined;
    }
    try {
        return JSON.parse(text) as T;
    } catch {
        return undefined;
    }
}

/** JSON.stringify 包一层：失败返回 undefined（如循环引用） */
export function safeStringify(value: unknown): string | undefined {
    try {
        return JSON.stringify(value);
    } catch {
        return undefined;
    }
}

/**
 * JSON 深拷贝：切断与调用方的可变别名，并得到与落库一致的 JSON-compatible 快照
 * 不可序列化输入（循环引用 / BigInt / toJSON 抛错）返回 undefined 而非抛出；
 * 处理不可信 DTO（插件返回 / 持久化数据）时用它代替裸 JSON.parse(JSON.stringify(x))
 */
export function cloneJson<T>(value: T): T | undefined {
    return safeParse<T>(safeStringify(value));
}
