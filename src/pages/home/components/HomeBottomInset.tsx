import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentMusic } from '@/core/player';

/**
 * 首页内容末尾垫片：MusicBar 缺席时让内容让出底部安全区（在场时由 MusicBar 自承接）
 * 单独订阅当前曲，避免整页 AppBar / 列表随切歌重渲染
 */
export function HomeBottomInset() {
    const insets = useSafeAreaInsets();
    const current = useCurrentMusic();
    // 在场时 MusicBar 承接底部安全区，垫片归零（模块间 gap 仍留出与播放条的间距）
    const height = current ? 0 : insets.bottom;
    return <View style={{ height }} />;
}
