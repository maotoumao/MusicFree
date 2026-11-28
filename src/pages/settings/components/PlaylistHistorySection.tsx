import { Section } from '@/components/ui/Section';
import { useT } from '@/i18n';

import { ChoiceRow } from './SettingRows';

import type { ConfigSchema } from '@/core/config';

/**
 * 排序档位：值域与 core/playlist 的排序词汇同源
 *
 * 不含「手动排序」（`manual`）：这一档不是能施加到任意一组歌上的规则，
 * 而是用户拖动后才产生的每歌单状态，混进规则列表会让列表不自洽——它的入口在歌单详情的排序菜单
 * 当前值不在本表内时行尾留空，不硬凑一档
 */
const SORT_CHOICES: readonly ConfigSchema['playlist.defaultMusicSortMode'][] = [
    'title',
    'titleDesc',
    'artist',
    'artistDesc',
    'album',
    'albumDesc',
    'addedAt',
    'addedAtDesc',
];

/** 最近播放的保留条数档位；值域见 configRules['basic.maxHistoryLen'] */
const HISTORY_LIMIT_CHOICES = [20, 50, 100, 200, 500] as const;

/** 歌单与历史分区：新建歌单的默认曲目排序 + 最近播放的保留量 */
export function PlaylistHistorySection() {
    const t = useT();
    return (
        <Section title={t('settings.playlist.section')}>
            <ChoiceRow
                configKey="playlist.defaultMusicSortMode"
                label={t('settings.playlist.defaultOrder')}
                options={SORT_CHOICES.map(value => ({
                    value,
                    label: t(`media.sortOption.${value}`),
                }))}
            />
            <ChoiceRow
                configKey="basic.maxHistoryLen"
                label={t('settings.playlist.maxHistory')}
                options={HISTORY_LIMIT_CHOICES.map(count => ({
                    value: count,
                    label: String(count),
                }))}
            />
        </Section>
    );
}
