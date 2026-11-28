import { MediaList } from '@/components/ui/MediaList';
import { useDownloadTasks } from '@/core/download';
import { useT } from '@/i18n';

import { DownloadTaskRow } from './DownloadTaskRow';

import type {
    ActiveDownloadFilter,
    ActiveDownloadRecord,
} from '@/core/download';
import type { StyleProp, ViewStyle } from 'react-native';

interface ActiveDownloadPaneProps {
    filter: ActiveDownloadFilter;
    contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * 活动队列的一个筛选面
 *
 * 每个面各自订阅：把三个面的 hook 都提到页面顶层，会让看不见的两面也跟着重算与重渲
 */
export function ActiveDownloadPane({
    filter,
    contentContainerStyle,
}: ActiveDownloadPaneProps) {
    const t = useT();
    const tasks = useDownloadTasks(filter);

    return (
        <MediaList
            data={tasks}
            keyExtractor={keyOf}
            renderItem={({ item }) => <DownloadTaskRow record={item} />}
            empty={{
                icon: 'download',
                title: t(`downloadManager.empty.${filter}`),
            }}
            // 任务会随状态在面之间进出，锚定可见项反而会在重排后跳位
            maintainVisibleContentPosition={false}
            contentContainerStyle={contentContainerStyle}
        />
    );
}

const keyOf = (record: ActiveDownloadRecord) => record.mediaKey;
