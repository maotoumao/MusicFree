import { useNavigation } from '@react-navigation/native';
import { Platform } from 'react-native';

import { isDownloadSupported } from '@/core/download';
import { useT } from '@/i18n';

import { EntryCards } from './EntryCards';
import { HistoryEntryCard } from './HistoryEntryCard';

import type { EntryCardItem } from './EntryCards';

/**
 * 首页入口：「最近播放」通栏卡在上，类型入口网格在下；不分组、不带计数
 *
 * 最近播放是「时间」维度、其余是「来源 / 类型」维度，独占一行既表达这层差别，
 * 也让四张类型卡两列排满、不出末行孤卡（见 HistoryEntryCard）。
 * 类型顺序按使用频率：先「我的」（本地 / 下载），后「发现」（榜单 / 推荐歌单）；
 * 类型差异不靠区块标题表达——三到五张卡再一分，每组只剩一两张，页面就碎了。
 * 本地音乐与下载有平台条件（扫描设备音频与下载引擎目前只有 Android 有），不可用时不占位。
 * 类型卡纯导航、不订阅数据；只有最近播放卡订阅历史（副题），且高度恒定，header 高度不随数据变。
 */
export function HomeEntries() {
    const t = useT();
    const navigation = useNavigation();
    const items: EntryCardItem[] = [];
    if (Platform.OS === 'android') {
        items.push({
            key: 'localMusic',
            label: t('localMusic.title'),
            icon: 'folder-open',
            a11yLabel: t('home.a11y.openLocalMusic'),
            onPress: () => navigation.navigate('LocalMusic'),
        });
    }
    if (isDownloadSupported) {
        items.push({
            key: 'downloadManager',
            label: t('downloadManager.title'),
            icon: 'download',
            a11yLabel: t('home.a11y.openDownloadManager'),
            onPress: () => navigation.navigate('DownloadManager'),
        });
    }
    items.push(
        {
            key: 'topList',
            label: t('topList.title'),
            icon: 'trophy',
            a11yLabel: t('home.a11y.openTopList'),
            onPress: () => navigation.navigate('TopList'),
        },
        {
            key: 'recommend',
            label: t('recommendPlaylists.title'),
            icon: 'flame',
            a11yLabel: t('home.a11y.openRecommendPlaylists'),
            onPress: () => navigation.navigate('RecommendPlaylists'),
        },
    );
    return <EntryCards featured={<HistoryEntryCard />} items={items} />;
}
