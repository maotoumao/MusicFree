import { useCallback } from 'react';

import { AppBar } from '@/components/layout/AppBar';
import { Screen } from '@/components/layout/Screen';
import { useBackAction } from '@/hooks/useBackAction';
import { useT } from '@/i18n';
import { MusicBar } from '@/widgets/MusicBar';
import { PluginSourcePager } from '@/widgets/PluginSourcePager';

import { RecommendSourceView } from './components/RecommendSourceView';
import { RECOMMEND_METHODS } from './lib/methods';

import type { Plugin } from '@/core/plugin';

/** 推荐歌单页：源 TabBar 横滑切源 + 每源「分类带 + 两列封面网格」 */
export default function RecommendPlaylistsScreen() {
    const t = useT();
    const back = useBackAction();
    const renderSource = useCallback(
        (plugin: Plugin) => <RecommendSourceView plugin={plugin} />,
        [],
    );
    return (
        <Screen edges={[]}>
            <AppBar leading={back} title={t('recommendPlaylists.title')} />
            <PluginSourcePager
                methods={RECOMMEND_METHODS}
                renderSource={renderSource}
            />
            <MusicBar />
        </Screen>
    );
}
