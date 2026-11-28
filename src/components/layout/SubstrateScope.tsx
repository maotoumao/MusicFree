import { createContext, useContext, type ReactNode } from 'react';

interface SubstrateScopeProps {
    /** 这棵子树是否直接坐在页面基底（可能是壁纸）之上 */
    onSubstrate: boolean;
    children: ReactNode;
}

/**
 * 默认 false：`OverlayHost` 与沉浸播放页都在 `Screen` 之外或用自己的实色面，
 * 它们背后根本没有壁纸，不该吃到为壁纸准备的兜底处理
 */
const SubstrateContext = createContext(false);

/** 标记子树是否坐在页面基底上；由 `Screen` 按自身是否透出壁纸提供 */
function SubstrateScope({ onSubstrate, children }: SubstrateScopeProps) {
    return (
        <SubstrateContext.Provider value={onSubstrate}>
            {children}
        </SubstrateContext.Provider>
    );
}

/** 当前子树是否坐在页面基底上 */
function useOnSubstrate(): boolean {
    return useContext(SubstrateContext);
}

export { SubstrateScope, useOnSubstrate };
