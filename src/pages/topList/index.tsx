import { useCallback } from 'react';

import { AppBar } from '@/components/layout/AppBar';
import { Screen } from '@/components/layout/Screen';
import { useBackAction } from '@/hooks/useBackAction';
import { useT } from '@/i18n';
import { MusicBar } from '@/widgets/MusicBar';
import { PluginSourcePager } from '@/widgets/PluginSourcePager';

import { TopListSourceView } from './components/TopListSourceView';
import { TOPLIST_METHODS } from './lib/methods';

import type { Plugin } from '@/core/plugin';

/** 榜单页：源 TabBar 横滑切源 + 每源「分组标题 + 两列封面网格」 */
export default function TopListScreen() {
    const t = useT();
    const back = useBackAction();
    const renderSource = useCallback(
        (plugin: Plugin) => <TopListSourceView plugin={plugin} />,
        [],
    );
    return (
        <Screen edges={[]}>
            <AppBar leading={back} title={t('topList.title')} />
            <PluginSourcePager
                methods={TOPLIST_METHODS}
                renderSource={renderSource}
            />
            <MusicBar />
        </Screen>
    );
}
