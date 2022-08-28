import {ISearchResultState} from '../store/atoms';

function getMediaItem(
  state: Record<string, ISearchResultState>,
  platformHash: string,
  mediaType: IPlugin.ISearchResultType,
) {
  const _result = state[platformHash]?.result ?? {};
  return _result[mediaType] ?? [];
}

export default function getMediaItems(
  state: Record<string, ISearchResultState>,
  platformHash: string,
  mediaType: IPlugin.ISearchResultType,
) {
  if (platformHash === 'all') {
    let mediaItems: any[] = [];
    const hashes = Object.keys(state);
    for (let i = 0; i < hashes.length; ++i) {
      mediaItems = mediaItems.concat(getMediaItem(state, hashes[i], mediaType));
    }
    return mediaItems;
  } else {
    return getMediaItem(state, platformHash, mediaType);
  }
}
