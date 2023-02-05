/** 备份与恢复 */
/** 歌单、插件 */
import {trimInternalData} from '@/utils/mediaItem';
import {compare} from 'compare-versions';
import MusicSheet from './musicSheet';
import PluginManager from './pluginManager';

/**
 * 结果：一份大的json文件
 * {
 *     musicSheets: [],
 *     plugins: [],
 * }
 */

interface IBackJson {
    musicSheets: ICommon.WithMusicList<IMusic.IMusicSheetItemBase>[];
    plugins: Array<{srcUrl: string; version: string}>;
}

function backup() {
    const {musicSheets, sheetMusicMap} = MusicSheet.getSheets();
    const normalizedSheets = musicSheets.map(_ => ({
        ..._,
        musicList: (sheetMusicMap[_.id] ?? []).map(trimInternalData),
        coverImg: undefined,
    }));
    const plugins = PluginManager.getValidPlugins();
    const normalizedPlugins = plugins.map(_ => ({
        srcUrl: _.instance.srcUrl,
        version: _.instance.version,
    }));

    return JSON.stringify({
        musicSheets: normalizedSheets,
        plugins: normalizedPlugins,
    });
}

async function resume(raw: string | Object) {
    let obj: IBackJson;
    if (typeof raw === 'string') {
        obj = JSON.parse(raw);
    } else {
        obj = raw as IBackJson;
    }
    const {plugins, musicSheets} = obj ?? {};
    /** 恢复插件 */
    const validPlugins = PluginManager.getValidPlugins();
    const resumePlugins = plugins?.map(_ => {
        // 校验是否安装过: 同源且本地版本更高就忽略掉
        if (
            validPlugins.find(
                plugin =>
                    plugin.instance.srcUrl === _.srcUrl &&
                    compare(
                        plugin.instance.version ?? '0.0.0',
                        _.version ?? '0.0.1',
                        '>=',
                    ),
            )
        ) {
            return;
        }
        return PluginManager.installPluginFromUrl(_.srcUrl);
    });
    /** 恢复歌单 */
    const resumeMusicSheets = MusicSheet.resumeSheets(musicSheets);

    return Promise.all([...resumePlugins, resumeMusicSheets]);
}

const Backup = {
    backup,
    resume,
};
export default Backup;
