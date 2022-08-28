import { pluginManager } from '@/common/pluginManager';
import {ISearchResultState} from '../store/atoms';

function getMediaItem<T extends any>(
  state: Record<string, ISearchResultState>,
  platformHash: string,
  mediaType: IPlugin.ISearchResultType,
): T[] {
  let mediaItems: T[] = [];
  const _result = state[platformHash]?.result ?? [];
  for (let i = 0; i < _result.length; ++i) {
    mediaItems = mediaItems.concat(
      ((_result[i] ?? {})[mediaType] ?? []) as T[],
    );
  }
  const platformName = pluginManager.getPluginByHash(platformHash)?.instance.platform;
  return mediaItems?.map((m: any) => ({
    ...m,
    platform: platformName,
  }));
}

export default function getMediaItems<T extends any>(
  state: Record<string, ISearchResultState>,
  platformHash: string,
  mediaType: IPlugin.ISearchResultType,
): T[] {
  if (platformHash === 'all') {
    let mediaItems: T[] = [];
    const hashes = Object.keys(state);
    for (let i = 0; i < hashes.length; ++i) {
      mediaItems = mediaItems.concat(
        getMediaItem(state, hashes[i], mediaType),
      );
    }
    return mediaItems;
  } else {
    return getMediaItem(state, platformHash, mediaType);
  }
}
