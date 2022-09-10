import {BottomSheetMethods} from '@gorhom/bottom-sheet/lib/typescript/types';
import {atom, useAtom} from 'jotai';
import {MutableRefObject, useEffect, useRef} from 'react';
import {BackHandler, NativeEventSubscription} from 'react-native';
import panels from './types';

type IPanel = typeof panels;
type IPanelkeys = keyof IPanel;

const panelNameAtom = atom<IPanelkeys | null>(null);
const payloadAtom = atom<any>(null);

export function _usePanel(
    ref?: MutableRefObject<BottomSheetMethods | undefined | null>,
) {
    const [panelName, setPanelName] = useAtom(panelNameAtom);
    const [payload, setPayload] = useAtom(payloadAtom);
    const backHandlerRef = useRef<NativeEventSubscription>();

    function showPanel<T extends IPanelkeys>(
        name: T,
        payload?: Parameters<IPanel[T]>[0],
    ) {
        setPanelName(name);
        setPayload(payload);
    }

    useEffect(() => {
        if (backHandlerRef.current) {
            backHandlerRef.current?.remove();
            backHandlerRef.current = undefined;
        }
        if (ref) {
            backHandlerRef.current = BackHandler.addEventListener(
                'hardwareBackPress',
                () => {
                    ref.current?.close();
                    return true;
                },
            );
        }
        return () => {
            if (backHandlerRef.current) {
                backHandlerRef.current?.remove();
                backHandlerRef.current = undefined;
            }
        };
    }, []);

    function unmountPanel() {
        setPanelName(null);
        setPayload(null);
    }

    return {payload, panelName, showPanel, unmountPanel};
}

export default function usePanel() {
    const {showPanel, unmountPanel} = _usePanel();
    return {showPanel, unmountPanel};
}
