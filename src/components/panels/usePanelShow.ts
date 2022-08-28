import {atom, useAtom} from 'jotai';
import panels from './types';

type IPanel = typeof panels;
type IPanelkeys = keyof IPanel;

const showAtom = atom(-1);
const panelNameAtom = atom<IPanelkeys | null>(null);
const payloadAtom = atom<any>(null);

export function _usePanel() {
  const [show, setShow] = useAtom(showAtom);
  const [panelName, setPanelName] = useAtom(panelNameAtom);
  const [payload, setPayload] = useAtom(payloadAtom);

  function showPanel<T extends IPanelkeys>(
    name: T,
    payload?: Parameters<IPanel[T]>[0],
  ) {
    setShow(0);
    setPanelName(name);
    setPayload(payload);
  }

  // todo 动画可以优化
  function closePanel() {
    setShow(-1);
    setPanelName(null);
    setPayload(null);
  }

  return {payload, show, sheetName: panelName, showPanel, closePanel};
}

export default function usePanel() {
  const {showPanel, closePanel} = _usePanel();
  return {showPanel, closePanel};
}
