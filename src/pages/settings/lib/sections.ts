import { Platform } from 'react-native';

import { isDownloadSupported } from '@/core/download';

import { CacheSection } from '../components/CacheSection';
import { DownloadSection } from '../components/DownloadSection';
import { InterfaceSection } from '../components/InterfaceSection';
import { LyricSection } from '../components/LyricSection';
import { PermissionSection } from '../components/PermissionSection';
import { PlaybackSection } from '../components/PlaybackSection';
import { PlaylistHistorySection } from '../components/PlaylistHistorySection';
import { PluginSection } from '../components/PluginSection';

import type { IconName } from '@/components/ui/icons.generated';
import type { PlainKey } from '@/i18n';
import type { ComponentType } from 'react';

export type SettingsSectionKey =
    | 'playback'
    | 'download'
    | 'lyric'
    | 'playlist'
    | 'interface'
    | 'plugin'
    | 'cache'
    | 'permission';

export interface SettingsSection {
    key: SettingsSectionKey;
    /** 分区标题 key（与各 Section 自己渲染的标题同源；纯文本键，非复数） */
    titleKey: PlainKey;
    /** 横屏目录用的行图标 */
    icon: IconName;
    Component: ComponentType;
    /**
     * 该分区在当前平台是否存在：与 Component 内部「整块不渲染」的判定同源，
     * 目录据此隐藏条目，免得点进去右栏是空的
     */
    visible: boolean;
}

/** 首个分区：横屏目录的默认选中项，也是选中项在当前平台不可见时的回落 */
export const PLAYBACK_SECTION: SettingsSection = {
    key: 'playback',
    titleKey: 'settings.playback.section',
    icon: 'play',
    Component: PlaybackSection,
    visible: true,
};

/**
 * 设置分区表（有序）：竖屏按此顺序一列到底，横屏按此顺序列目录
 * 顺序即产品决策，别按字母重排
 */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
    PLAYBACK_SECTION,
    {
        key: 'download',
        titleKey: 'settings.download.section',
        icon: 'download',
        Component: DownloadSection,
        // DownloadSection：无下载引擎的平台整块不渲染
        visible: isDownloadSupported,
    },
    {
        key: 'lyric',
        titleKey: 'settings.lyric.section',
        icon: 'captions',
        Component: LyricSection,
        visible: true,
    },
    {
        key: 'playlist',
        titleKey: 'settings.playlist.section',
        icon: 'list-music',
        Component: PlaylistHistorySection,
        visible: true,
    },
    {
        key: 'interface',
        titleKey: 'settings.interface.section',
        icon: 'palette',
        Component: InterfaceSection,
        visible: true,
    },
    {
        key: 'plugin',
        titleKey: 'settings.plugin.section',
        icon: 'puzzle',
        Component: PluginSection,
        visible: true,
    },
    {
        key: 'cache',
        titleKey: 'settings.cache.section',
        icon: 'database',
        Component: CacheSection,
        visible: true,
    },
    {
        key: 'permission',
        titleKey: 'settings.permission.section',
        icon: 'folder-open',
        Component: PermissionSection,
        // PermissionSection：全是 Android 概念，iOS 整块不渲染
        visible: Platform.OS === 'android',
    },
];

/** 目录里可见的分区 */
export const VISIBLE_SETTINGS_SECTIONS: readonly SettingsSection[] =
    SETTINGS_SECTIONS.filter(section => section.visible);
