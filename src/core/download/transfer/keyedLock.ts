/**
 * 按 key 串行的通用机制：不依赖下载领域，只保证同一 key 下的异步操作排队
 * 暂放在下载模块内：现在只有它一个消费者；出现第二个时再上提到 infra
 */

/**
 * 按 key 串行执行：同一 key 的操作排队，不同 key 并行
 * 下载侧一首歌（mediaKey）的完成入账、用户暂停 / 取消 / 删除会从事件与操作两个方向同时进来，
 * 每一个都是「读状态 → 异步 I/O → 写状态」，不串行就会读到过期状态并互相覆盖
 */
export class KeyedLock {
    /** key → 该 key 的队尾；队列排空后立即删除，避免长期运行后 Map 只增不减 */
    readonly #tails = new Map<string, Promise<unknown>>();

    /**
     * 排到 `key` 的队尾执行 `task`，返回它的结果
     * 前一个任务失败不影响后续排队者：链上只等它结束，不传播成败
     */
    run<T>(key: string, task: () => Promise<T>): Promise<T> {
        const prev = this.#tails.get(key) ?? Promise.resolve();
        const result = prev.then(task, task);
        const tail = result.then(
            () => undefined,
            () => undefined, // 吞掉拒绝，避免未处理拒绝告警；成败由调用方自己拿 result 判断
        );
        this.#tails.set(key, tail);
        tail.then(() => {
            // 期间没有新任务排进来才清理，否则会丢掉后来者的队尾
            if (this.#tails.get(key) === tail) {
                this.#tails.delete(key);
            }
        });
        return result;
    }
}
