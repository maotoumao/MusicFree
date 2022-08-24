import {atom, useSetAtom} from 'jotai';

interface IShareInfo {
  content?: any;
  title?: string;
  desc?: string;
}
const shareInfoAtom = atom<IShareInfo>({
  content: undefined,
  title: undefined,
  desc: undefined,
});

const showShareAtom = atom(false);

export default function useShare() {
  const setShowShare = useSetAtom(showShareAtom);
  const setShareInfo = useSetAtom(shareInfoAtom);

  function showShare(info: IShareInfo) {
    setShowShare(true);
    setShareInfo(info);
  }

  function closeShare() {
    setShowShare(false);
    setShareInfo({});
  }
  return {showShare, closeShare};
}

export {shareInfoAtom, showShareAtom};
