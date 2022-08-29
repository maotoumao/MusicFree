import {internalKey} from '@/constants/commonConst';
import pathConst from '@/constants/pathConst';
import isSameMusicItem from '@/utils/isSameMusicItem';
import StateMapper from '@/utils/stateMapper';
import {getStorage, setStorage} from '@/utils/storageUtil';
import produce from 'immer';
import {useEffect, useState} from 'react';
import {exists, unlink, mkdir, downloadFile, readDir} from 'react-native-fs';
import Toast from 'react-native-toast-message';
import {pluginManager} from './pluginManager';

interface IDownloadMusicOptions {
  musicItem: IMusic.IMusicItem;
  filename: string;
  jobId?: number;
  progress?: number;
  size?: number;
}
/** 已下载 */
let downloadedMusic: IMusic.IMusicItem[] = [];
/** 下载中 */
let downloadingMusic: IDownloadMusicOptions[] = [];
/** 队列中 */
let pendingMusic: IDownloadMusicOptions[] = [];
/** meta */
let downloadedData: Record<string, IMusic.IMusicItem> = {};

const downloadedStateMapper = new StateMapper(() => downloadedMusic);

/** 根据文件名解析 */
function parseFilename(fn: string): IMusic.IMusicItemBase | null {
  const data = fn.slice(0, fn.lastIndexOf('.')).split('@');
  const [platform, id, title, artist] = data;
  if (!platform || !id) {
    return null;
  }
  return {
    id,
    platform,
    title,
    artist,
  };
}

/** 生成下载文件名 */
function generateFilename(musicItem: IMusic.IMusicItem) {
  return (
    `${musicItem.platform}@${musicItem.id}@${musicItem.title}@${musicItem.artist}`.slice(
      0,
      200,
    ) + '.mp3'
  );
}

/** 初始化 */
async function setupDownload() {
  if (!(await exists(pathConst.downloadPath))) {
    await mkdir(pathConst.downloadPath);
    return;
  }
  downloadedData = (await getStorage('download-music')) ?? {};
  const downloads = await readDir(pathConst.downloadPath);
  downloadedMusic = [];
  for (let i = 0; i < downloads.length; ++i) {
    const data = parseFilename(downloads[i].name);
    if (data) {
      const mi = downloadedData[`${data.platform}${data.id}`] ?? {...data};
      mi[internalKey] = {
        localPath: downloads[i].path,
      };
      mi && downloadedMusic.push(mi);
    }
  }
  downloadedStateMapper.notify();
}

/** 从队列取出下一个要下载的 */
async function downloadNext() {
  // 最大同时下载5个
  if (downloadingMusic.length >= 5 || pendingMusic.length === 0) {
    return;
  }
  const nextItem = pendingMusic[0];
  const musicItem = nextItem.musicItem;
  let url = musicItem.url;
  let headers = musicItem.headers;
  if (!url || !url?.startsWith('http')) {
    // 插件播放
    const plugin = pluginManager.getPlugin(musicItem.platform);
    if (plugin && plugin.instance.getMusicTrack) {
      try {
        const data = await plugin.instance.getMusicTrack(musicItem);
        url = data?.url;
        headers = data?.headers;
      } catch {}
    }
  }
  pendingMusic = produce(pendingMusic, draft =>
    draft.filter(_ => _.filename !== nextItem.filename),
  );
  downloadingMusic = produce(downloadingMusic, draft => {
    draft.push(nextItem);
  });
  downloadNext();
  const {promise, jobId} = downloadFile({
    fromUrl: url ?? '',
    toFile: pathConst.downloadPath + nextItem.filename,
    headers: headers,
    background: true,
    begin(res) {
      nextItem.size = res.contentLength;
    },
    progress(res) {
      nextItem.progress = res.bytesWritten;
    },
  });
  nextItem.jobId = jobId;
  try {
    await promise;
    // 下载完成
    downloadedMusic = produce(downloadedMusic, _ => {
      if (
        downloadedMusic.findIndex(_ => isSameMusicItem(musicItem, _)) === -1
      ) {
        _.push({
          ...musicItem,
          [internalKey]: {
            localPath: pathConst.downloadPath + nextItem.filename,
          },
        });
      }
      return _;
    });
    downloadingMusic = produce(downloadingMusic, _ =>
      _.filter(item => !isSameMusicItem(item.musicItem, musicItem)),
    );
    downloadedData[`${musicItem.platform}${musicItem.id}`] = musicItem;
    setStorage('download-music', downloadedData);
    if (pendingMusic.length === 0) {
      Toast.show({
        text1: '下载完成',
        position: 'bottom',
      });
    }
    downloadedStateMapper.notify();
    downloadNext();
  } catch {
    downloadingMusic = produce(downloadingMusic, _ =>
      _.filter(item => !isSameMusicItem(item.musicItem, musicItem)),
    );
  }
}

/** 下载音乐 */
function downloadMusic(musicItem: IMusic.IMusicItem) {
  // 如果已经在下载中
  const pendingInd = pendingMusic.findIndex(_ =>
    isSameMusicItem(_.musicItem, musicItem),
  );
  const downloadingInd = downloadingMusic.findIndex(_ =>
    isSameMusicItem(_.musicItem, musicItem),
  );
  if (pendingInd === -1 && downloadingInd === -1) {
    pendingMusic.push({
      musicItem,
      filename: generateFilename(musicItem),
    });
    downloadNext();
  }
}

/** 是否下载 */
function isDownloaded(mi: IMusic.IMusicItem | null) {
  return mi
    ? downloadedMusic.findIndex(_ => isSameMusicItem(_, mi)) !== -1
    : false;
}

/** 获取下载的音乐 */
function getDownloaded(mi: IMusic.IMusicItem | null) {
  return mi ? downloadedMusic.find(_ => isSameMusicItem(_, mi)) : null;
}

async function removeDownloaded(mi: IMusic.IMusicItem) {
  const localPath = getDownloaded(mi)?.[internalKey]?.localPath;
  if (localPath) {
    await unlink(localPath);
    downloadedMusic = downloadedMusic.filter(_ => !isSameMusicItem(_, mi));
    downloadedStateMapper.notify();
  }
}

/** 某个音乐是否被下载-状态 */
function useIsDownloaded(mi: IMusic.IMusicItem | null) {
  if (!mi) {
    return false;
  }
  const downloadedMusicState = downloadedStateMapper.useMappedState();
  const [downloaded, setDownloaded] = useState<boolean>(isDownloaded(mi));
  useEffect(() => {
    setDownloaded(
      downloadedMusicState.findIndex(_ => isSameMusicItem(mi, _)) !== -1,
    );
  }, [downloadedMusicState, mi]);
  return downloaded;
}

const DownloadManager = {
  downloadMusic,
  setupDownload,
  useDownloadedMusic: downloadedStateMapper.useMappedState,
  isDownloaded,
  useIsDownloaded,
  getDownloaded,
  removeDownloaded
};

export default DownloadManager;
