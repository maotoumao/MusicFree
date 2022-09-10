/**
 * 歌单管理
 */
import produce from 'immer';
import {nanoid} from 'nanoid';
import {getMultiStorage, getStorage, setStorage} from '@/utils/storage';
import {StorageKeys} from '@/constants/commonConst';
import objectPath from 'object-path';

// pluginname - tablekey
let mediaMetaKeys: Record<string, string> = {};
// pluginname - id - mediameta
let mediaMetas: Record<string, Record<string, ICommon.IMediaMeta>> = {};

async function setup() {
  const metaKeys = (await getStorage(StorageKeys.MediaMeta)) ?? {};
  if (!metaKeys) {
    await setStorage(StorageKeys.MediaMeta, {});
  }
  const kv: [string, string][] = Object.entries(metaKeys);
  const metas = await getMultiStorage(kv.map(_ => _[1]));
  const newMediaMetas: Record<string, Record<string, any>> = {};
  metas.forEach((value, index) => {
    newMediaMetas[kv[index][0]] = value ?? {};
  });
  mediaMetas = newMediaMetas;
}

function getMediaMeta(mediaItem: ICommon.IMediaBase) {
  return mediaMetas[mediaItem.platform]?.[mediaItem.id] ?? null;
}

function getByMediaKey(mediaKey: string) {
  const [platform, id] = mediaKey.split('@');
  return getMediaMeta({platform, id});
}

/** 创建/更新mediameta */
async function updateMediaMeta(
  mediaItem: ICommon.IMediaBase,
  patch?: Record<string, any> | Array<[string, any]>,
) {
  const {platform, id} = mediaItem;
  // 创建一个新的表
  if (!mediaMetaKeys[platform]) {
    const newkey = nanoid();
    mediaMetaKeys[platform] = newkey;
    await setStorage(StorageKeys.MediaMeta, mediaMetaKeys);
    mediaMetas[platform] = {};
  }
  let newMeta = mediaMetas;
  if (Array.isArray(patch)) {
    newMeta = produce(mediaMetas, draft => {
      patch.forEach(([pathName, value]) => {
        objectPath.set(draft, `${platform}.${id}.${pathName}`, value);
      });
      return draft;
    });
  } else {
    const _patch = patch ?? mediaItem;
    newMeta = produce(mediaMetas, draft => {
      const pluginMeta = mediaMetas[platform] ?? {};
      if (!draft[platform]) {
        draft[platform] = {};
      }
      if (pluginMeta[id]) {
        draft[platform][id] = {...pluginMeta[id], ..._patch};
      } else {
        draft[platform][id] = _patch;
      }
    });
  }
  setStorage(mediaMetaKeys[platform], newMeta[platform]);
  mediaMetas = newMeta;
}

const MediaMeta = {
  setup,
  get: getMediaMeta,
  getByMediaKey,
  update: updateMediaMeta,
};

// todo: clear
export default MediaMeta;
