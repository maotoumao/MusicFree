import {getAppMeta, setAppMeta} from '@/core/appMeta.ts';
import {getStorage as oldGetStorage} from '@/utils/storage';
import storage from '@/core/musicSheet/storage.ts';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default async function migrate() {
    const dbUpdated = +(getAppMeta('MusicSheetVersion') || '0') > 1;
    if (dbUpdated) {
        return;
    }
    try {
        // 原来的musicSheets
        const musicSheets: IMusic.IMusicSheetItemBase[] = await oldGetStorage(
            'music-sheets',
        );
        if (!musicSheets) {
            setAppMeta('MusicSheetVersion', '1');
            return;
        }

        await storage.setSheets(musicSheets);
        await AsyncStorage.removeItem('music-sheets');
        for (let sheet of musicSheets) {
            const musicList = await oldGetStorage(sheet.id);
            await storage.setMusicList(sheet.id, musicList);
            await AsyncStorage.removeItem(sheet.id);
        }
        setAppMeta('MusicSheetVersion', '1');
    } catch (e) {
        console.warn('升级失败', e);
    }
}

export const migrateV2 = {
    migrate(sheetId: string, musicItems: IMusic.IMusicItem[]) {
        const dbUpdated = getAppMeta('MusicSheetVersion') === '2';
        if (dbUpdated) {
            return;
        }
        let dirty = false;
        const now = Date.now();
        musicItems.forEach((it, index) => {
            if (!it.$timestamp || it.$sortIndex === undefined) {
                it.$timestamp = now;
                it.$sortIndex = index;
                dirty = true;
            }
        });
        if (dirty) {
            storage.setMusicList(sheetId, musicItems);
        }
    },
    done() {
        setAppMeta('MusicSheetVersion', '2');
    },
};
