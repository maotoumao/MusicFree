/**
 * 网络归类：包 `@react-native-community/netinfo`
 *
 * 只回答一件事——**当前连接要不要花流量**。这是「仅 Wi-Fi 下载」这类计费策略唯一需要
 * 问系统的事实；要不要因此拦下任务属于业务决策，由调用方（`core`）判断
 */
import NetInfo, { NetInfoStateType } from '@react-native-community/netinfo';

/**
 * 网络归类
 * `unknown` 是**独立一档**，不能并进 `nonCellular`：系统说「判不出来」不等于说「不是蜂窝」，
 * 两者混同会让默认关闭的流量闸门在判不出网络时放行，用户的流量就这么花掉了
 */
export type NetworkClass = 'cellular' | 'nonCellular' | 'unknown';

/** 当前网络归类 */
export async function getNetworkClass(): Promise<NetworkClass> {
    return classify((await NetInfo.fetch()).type);
}

/**
 * 订阅网络归类变化，返回退订函数
 * 订阅后不久会先回报一次当前值（netinfo 的既有行为），故不必另外读一遍
 */
export function onNetworkClassChange(
    listener: (network: NetworkClass) => void,
): () => void {
    return NetInfo.addEventListener(state => listener(classify(state.type)));
}

function classify(type: NetInfoStateType): NetworkClass {
    if (type === NetInfoStateType.cellular) return 'cellular';
    if (type === NetInfoStateType.unknown) return 'unknown';
    // 无连接（none）归入不花流量：它不是计费问题，交给传输自己失败即可
    return 'nonCellular';
}
