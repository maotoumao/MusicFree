import {ResumeMode} from '@/constants/commonConst.ts';

export default {
    settings: {
        [ResumeMode.Overwrite]: '合并同名歌单',
        [ResumeMode.Append]: '恢复为新歌单',
        [ResumeMode.OverwriteDefault]: '合并默认歌单，其他歌单恢复为新歌单',
    },
};
