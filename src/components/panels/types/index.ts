import AddToMusicSheet from './addToMusicSheet';
import AssociateLrc from './associateLrc';
import ColorPicker from './colorPicker';
import MusicItemOptions from './musicItemOptions';
import MusicQuality from './musicQuality';
import NewMusicSheet from './newMusicSheet';
import PlayList from './playList';
import PlayRate from './playRate';
import SearchLrc from './searchLrc';
import SetUserVariables from './setUserVariables';
import SheetTags from './sheetTags';
import SimpleInput from './simpleInput';
import SimpleSelect from './simpleSelect';
import TimingClose from './timingClose';

export default {
    /** 加入歌单 */
    AddToMusicSheet: AddToMusicSheet,
    /** 歌曲选项 */
    MusicItemOptions: MusicItemOptions,
    /** 新建歌单 */
    NewMusicSheet: NewMusicSheet,
    /** 当前播放列表 */
    PlayList: PlayList,
    /** 关联歌词 */
    AssociateLrc: AssociateLrc,
    /** 简单的输入 */
    SimpleInput: SimpleInput,
    /** 定时关闭 */
    TimingClose: TimingClose,
    /** 音质选择 */
    MusicQuality: MusicQuality,
    /** 播放速度 */
    PlayRate: PlayRate,
    /** 歌单tag */
    SheetTags: SheetTags,
    /** 搜索歌词 */
    SearchLrc,
    /** 简单的选择 */
    SimpleSelect,
    /** 颜色选择器 */
    ColorPicker,
    /** 设置插件用户变量 */
    SetUserVariables,
};
