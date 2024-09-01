import EventBus from '@/utils/eventBus.ts';

interface IMusicSheetEvents {
    UpdateMusicList: {
        sheetId: string;
        updateType: 'length' | 'resort'; // 更新类型
    };
    UpdateSheetBasic: {
        sheetId: string;
    };
}

const ee = new EventBus<IMusicSheetEvents>();

export default ee;
