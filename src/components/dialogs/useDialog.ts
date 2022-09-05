import {atom, useAtom} from 'jotai';
import {IDialogKey, IDialogType} from './components';

type injectedProps = 'visible' | 'hideDialog';
const dialogNameAtom = atom<IDialogKey | null>(null);
const payloadAtom = atom<
  Omit<Parameters<IDialogType[keyof IDialogType]>[0], injectedProps> | undefined
>(undefined);

// type IDialogType = {
//   'simple-dialog': {
//     title: string;
//     content: string;
//     onOk?: () => void;
//   };
// };

export default function useDialog() {
  const [dialogName, setDialogName] = useAtom(dialogNameAtom);
  const [payload, setPayload] = useAtom(payloadAtom);

  function showDialog<T extends keyof IDialogType>(
    name: T,
    payload?: Omit<Parameters<IDialogType[T]>[0], injectedProps>,
  ) {
    setDialogName(name);
    setPayload(payload);
  }

  function hideDialog() {
    setDialogName(null);
    setPayload(undefined);
  }

  return {dialogName, payload, showDialog, hideDialog};
}
