/**
 * 面向 UI 的状态镜像：后台只暂存最新值，回前台一次性刷入
 *
 * 切后台时 Fabric 会移除排空 mount 指令的帧回调（`FabricUIManager.onHostPause`
 * → `DispatchUIFrameCallback.pause`），而 JS 侧照旧渲染、照旧提交，指令只进不出；
 * 回前台恢复后一次帧回调把积压全执行完（`tryDispatchMountItems` 没有每帧预算，
 * 不像 `dispatchPreMountItems` 有半帧上限），UI 线程被占住数秒。积压量正比于后台
 * 时长——后台连播一小时就是七千多次提交，其中绝大多数是同一根进度条的属性更新，
 * 写完立刻被下一条覆盖，一条都不能少地执行一遍。
 *
 * 故后台不写 atom，只在这里压住最新值：同一个 atom 反复发布就是反复覆盖一格，
 * 冗余在**入队之前**被吸收，暂存量只与 atom 个数有关、与后台时长无关。
 *
 * **只适用于订阅者全是 React 的 atom。** 有 core 侧订阅者（`atomStore.sub`）的
 * atom 不能走这里——它们在后台仍需即时通知（如桌面歌词）。core 之间该走回调，
 * atom 只留给 React。
 */
import { AppState } from 'react-native';

import { atomStore } from '@/utils/atomStore';

import type { PrimitiveAtom } from 'jotai';

/** 尚未刷入的最新值；每个 atom 至多一份 */
const pending = new Map<object, unknown>();

let listening = false;

/**
 * 只有**明确处于后台**才缓冲
 *
 * 不把 iOS 的 `inactive`算作后台：它是**仍然可见**的状态。本应用开着 iPad 分屏
 * （`TARGETED_DEVICE_FAMILY = "1,2"` 且未设 `UIRequiresFullScreen`），未获焦点的
 * 那一侧会长期停在 `inactive` 且用户看得见——把它当后台会让进度条、歌词高亮
 * 冻在失焦那一刻，直到点回来。而这里的收益是零：促成本机制的
 * `FabricUIManager.onHostPause` 是安卓独有的，iOS 在 `inactive` 下没有被暂停的
 * host，缓冲挡不住任何积压，只白白牺牲可见状态的新鲜度。
 *
 * 判据取「明确是后台」而非「不是 active」，是因为代价不对称：判成后台却没有后续
 * 的 `change` 事件，刷入时机就永不到达、界面停在旧值上；判成前台最多是少省一次
 * 提交。`currentState` 在原生模块缺席时是 `null`（如测试环境），正落在这一侧
 */
function isBackground(): boolean {
    return AppState.currentState === 'background';
}

/** 首次发布时才挂监听：没有发布方就没有需要刷入的东西 */
function listen(): void {
    if (listening) {
        return;
    }
    listening = true;
    AppState.addEventListener('change', state => {
        if (state === 'active') {
            flush();
        }
    });
}

/** 连续同步写入：React 把它们批处理成一次提交，而不是每个 atom 一次 */
function flush(): void {
    if (pending.size === 0) {
        return;
    }
    // 逐格删而不是最后 clear()：写入会同步唤醒 jotai 订阅者，订阅者若在此期间
    // 回头发布，clear() 就可能把那次发布一起吞掉。只消费自己写过的那一格，
    // 就不必依赖「flush 只在前台跑，故重入必走直写」这个外部不变量
    for (const [target, value] of pending) {
        pending.delete(target);
        atomStore.set(target as PrimitiveAtom<unknown>, value);
    }
}

/** 发布一个只有 React 在看的值：前台直写，后台暂存 */
function publishToUi<T>(target: PrimitiveAtom<T>, value: T): void {
    listen();
    if (isBackground()) {
        pending.set(target, value);
        return;
    }
    // currentState 先翻回 active、change 事件后到，这个窗口里直写的新值会被随后的
    // flush 用暂存的旧值盖回去，故直写前先清掉自己那一格
    pending.delete(target);
    atomStore.set(target, value);
}

/**
 * 读最新值：优先返回尚未刷入的暂存值
 * 程序读（core 内部、读改写）因此永远不落后于真实状态，落后的只有屏幕
 */
function readLatest<T>(target: PrimitiveAtom<T>): T {
    return pending.has(target)
        ? (pending.get(target) as T)
        : atomStore.get(target);
}

export { publishToUi, readLatest };
