/**
 * 屏间一次性值传递：把重型/不可序列化值暂存换一个 ticket；导航只传 ticket，目标屏 claim 取回
 * 纯内存、不持久化；claim 即删；软上限防泄漏
 * 仅用于「一跳、屏局部、无其他真相源」的值——多数跨屏数据应走 TanStack 重取或 core 态
 */
const CAP = 50;
const entries = new Map<string, unknown>();
let seq = 0;

/** 暂存一个值，返回取件 ticket */
export function stash(value: unknown): string {
    // 软上限：超了淘汰最旧（Map 迭代序 = 插入序）
    while (entries.size >= CAP) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) {
            break;
        }
        entries.delete(oldest);
    }
    seq += 1;
    const ticket = `s${seq}`;
    entries.set(ticket, value);
    return ticket;
}

/** 按 ticket 取回并删除（一次性） */
export function claim<T>(ticket: string): T | undefined {
    const value = entries.get(ticket) as T | undefined;
    entries.delete(ticket);
    return value;
}

/** 手动丢弃（极端清理用） */
export function drop(ticket: string): void {
    entries.delete(ticket);
}
