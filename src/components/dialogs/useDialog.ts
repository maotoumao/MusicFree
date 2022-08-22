import {atom, useAtom} from 'jotai';

const dialogNameAtom = atom<keyof IDialogType | null>(null);
const payloadAtom = atom<IDialogType[keyof IDialogType] | undefined>(undefined);

type IDialogType = {
  'simple-dialog': {
    title: string;
    content: string;
    onOk?: () => void;
  };
};

export default function useDialog() {
  const [dialogName, setDialogName] = useAtom(dialogNameAtom);
  const [payload, setPayload] = useAtom(payloadAtom);

  function showDialog<T extends keyof IDialogType>(
    name: T,
    payload?: IDialogType[T],
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
