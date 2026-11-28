/**
 * 用于 JSON-like DTO 和快照的递归只读视图
 * 仅提供编译期约束；运行时仍须由所属模块深拷贝，避免内部引用泄漏
 */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
    ? T
    : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;
