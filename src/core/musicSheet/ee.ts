import EventBus from '@/utils/eventBus.ts';

interface IMusicSheetEvents {
    UpdateMusicList: {
        sheetId: string;
        updateType: 'length' | 'resort'; // 更新类型
    };
}

const ee = new EventBus<IMusicSheetEvents>();

export default ee;
