/**
 * 歌单管理
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import produce from 'immer';
import {useEffect, useState} from 'react';
import {nanoid} from 'nanoid';
import {ToastAndroid} from 'react-native';
import {getMultiStorage, getStorage, setStorage} from '@/utils/storage';
import {StorageKeys} from '@/constants/commonConst';
import StateMapper from '@/utils/stateMapper';

// pluginname - tablekey
let mediaMetaKeys: Record<string, string> = {};
// pluginname - id - mediameta
let mediaMetas: Record<string, Record<string, ICommon.IMediaMeta>> = {};
const mediaMetasStateMapper = new StateMapper(() => mediaMetas); // 可能不用状态

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
  mediaMetasStateMapper.notify();
}

function getMediaMeta(mediaItem: ICommon.IMediaBase) {
  return mediaMetas[mediaItem.platform]?.[mediaItem.id] ?? null;
}

// /** 创建/更新mediameta */
// async function updateMediaMeta(mediaItem: ICommon.IMediaBase) {
//   const {platform, id} = mediaItem;
//   if (!mediaMetaKeys[platform]) {
//     const newkey = nanoid();
//     mediaMetaKeys[platform] = newkey;
//     await setStorage(StorageKeys.MediaMeta, mediaMetaKeys);
//     mediaMetas[platform] = {};
//   }

//   const newMeta = produce(mediaMetas, draft => {
//     const pluginMeta = mediaMetas[platform];
//     if (pluginMeta[id]) {
//       draft[platform][id] = {...pluginMeta[id], ...mediaItem};
//     } else {
//       draft[platform][id] = mediaItem;
//     }
//   });
//   setStorage(mediaMetaKeys[platform], newMeta);
//   mediaMetas = newMeta;
//   mediaMetasStateMapper.notify();
// }

/** 创建/更新mediameta */
async function updateMediaMeta(mediaItem: ICommon.IMediaBase, patch?: Record<string, any>) {
  const {platform, id} = mediaItem;
  if (!mediaMetaKeys[platform]) {
    const newkey = nanoid();
    mediaMetaKeys[platform] = newkey;
    await setStorage(StorageKeys.MediaMeta, mediaMetaKeys);
    mediaMetas[platform] = {};
  }
  const _patch = patch ?? mediaItem;
  const newMeta = produce(mediaMetas, draft => {
    const pluginMeta = mediaMetas[platform] ?? {};
    if(!draft[platform]) {
      draft[platform] = {};
    }
    if (pluginMeta[id]) {
      draft[platform][id] = {...pluginMeta[id], ..._patch};
    } else {
      draft[platform][id] = _patch;
    }
  });
  setStorage(mediaMetaKeys[platform], newMeta);
  mediaMetas = newMeta;
}

const MediaMeta = {
  setup,
  get: getMediaMeta,
  update: updateMediaMeta,
};

// todo: clear
export default MediaMeta;
