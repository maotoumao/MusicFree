import RNFS from 'react-native-fs';

const basePath = `${RNFS.PicturesDirectoryPath}/MusicFree/`;
export async function saveToGallery(src: string) {
  const fileName = `${basePath}${Date.now()}.png`;
  if (!(await RNFS.exists(basePath))) {
    await RNFS.mkdir(basePath);
  }
  if (await RNFS.exists(src)) {
    try {
      await RNFS.copyFile(src, fileName);
    } catch (e) {
      console.log('... ', e);
    }
  }
  if (src.startsWith('http')) {
    await RNFS.downloadFile({
      fromUrl: src,
      toFile: fileName,
      background: true,
    });
  }
  if (src.startsWith('data')) {
    await RNFS.writeFile(fileName, src);
  }
}

export function sizeFormatter(bytes: number) {
  if (bytes === 0) return '0B';
  let k = 1024,
    sizes = ['B', 'KB', 'MB', 'GB'],
    i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + sizes[i];
}
