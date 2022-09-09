import {internalSerialzeKey, internalSymbolKey} from '@/constants/commonConst';
import produce from 'immer';

/** 获取mediakey */
export function getMediaKey(mediaItem: ICommon.IMediaBase) {
  return `${mediaItem.platform}@${mediaItem.id}`;
}

/** 比较两歌media是否相同 */
export function isSameMediaItem(
  a: ICommon.IMediaBase | null | undefined,
  b: ICommon.IMediaBase | null | undefined,
) {
  return a && b && a.id === b.id && a.platform === b.platform;
}

/** 获取复位的mediaItem */
export function resetMediaItem(
  mediaItem: ICommon.IMediaBase,
  platform?: string,
  immer?: boolean,
) {
  if (!immer) {
    mediaItem.platform = platform ?? mediaItem.platform;
    mediaItem[internalSerialzeKey] = undefined;
    mediaItem[internalSymbolKey] = undefined;
    return mediaItem;
  } else {
    return produce(mediaItem, _ => {
      _.platform = platform ?? mediaItem.platform;
      _[internalSerialzeKey] = undefined;
      _[internalSymbolKey] = undefined;
    });
  }
}
