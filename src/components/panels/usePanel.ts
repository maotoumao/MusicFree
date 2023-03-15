import {GlobalState} from '@/utils/stateMapper';
import {useCallback} from 'react';
import {DeviceEventEmitter} from 'react-native';
import panels from './types';

type IPanel = typeof panels;
type IPanelkeys = keyof IPanel;

interface IPanelInfo {
    name: IPanelkeys | null;
    payload: any;
}

/** 浮层信息 */
export const panelInfoStore = new GlobalState<IPanelInfo>({
    name: null,
    payload: null,
});

/** 使用浮层的hook */
export default function usePanel() {
    const showPanel = useCallback(function <T extends IPanelkeys>(
        name: T,
        payload?: Parameters<IPanel[T]>[0],
    ) {
        if (panelInfoStore.getValue().name) {
            DeviceEventEmitter.emit('hidePanel', () => {
                panelInfoStore.setValue({
                    name,
                    payload,
                });
            });
        } else {
            panelInfoStore.setValue({
                name,
                payload,
            });
        }
    },
    []);

    const hidePanel = useCallback(() => {
        DeviceEventEmitter.emit('hidePanel');
    }, []);

    return {showPanel, hidePanel};
}
