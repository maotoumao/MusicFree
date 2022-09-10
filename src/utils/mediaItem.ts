import {internalSerialzeKey, internalSymbolKey} from '@/constants/commonConst';
import produce from 'immer';

/** 获取mediakey */
export function getMediaKey(mediaItem: ICommon.IMediaBase) {
  return `${mediaItem.platform}@${mediaItem.id}`;
}

/** 解析mediakey */
export function parseMediaKey(key: string): ICommon.IMediaBase {
  try {
    const str = JSON.parse(key.trim());
    let platform, id;
    if (typeof str === 'string') {
      [platform, id] = str.split('@');
    } else {
      platform = str?.platform;
      id = str?.id;
    }
    if(!platform || !id) {
      throw new Error('mediakey不完整')
    }
    return {
      platform,
      id,
    };
  } catch (e: any) {
    throw e;
  }
}

/** 比较两歌media是否相同 */
export function isSameMediaItem(
  a: ICommon.IMediaBase | null | undefined,
  b: ICommon.IMediaBase | null | undefined,
) {
  return a && b && a.id === b.id && a.platform === b.platform;
}

/** 获取复位的mediaItem */
export function resetMediaItem<T extends ICommon.IMediaBase>(
  mediaItem: T,
  platform?: string,
  newObj?: boolean,
): T {
  if (!newObj) {
    mediaItem.platform = platform ?? mediaItem.platform;
    mediaItem[internalSerialzeKey] = undefined;
    return mediaItem;
  } else {
    return produce(mediaItem, _ => {
      _.platform = platform ?? mediaItem.platform;
      _[internalSerialzeKey] = undefined;
    });
  }
}

export function mergeProps(
  mediaItem: ICommon.IMediaBase,
  props: Record<string, any> | undefined,
) {
  return props
    ? {
        ...mediaItem,
        ...props,
      }
    : mediaItem;
}
