import { ScrollView, StyleSheet } from 'react-native';

import { AppBar } from '@/components/layout/AppBar';
import { PaperPane } from '@/components/layout/PaperPane';
import { Screen } from '@/components/layout/Screen';
import { Section } from '@/components/ui/Section';
import { BUILTIN_THEME_PACKS } from '@/core/theme';
import { layout, space } from '@/design';
import { useBackAction } from '@/hooks/useBackAction';
import { useContentColumn } from '@/hooks/useContentColumn';
import { useT } from '@/i18n';

import { SystemModeSection } from './components/SystemModeSection';
import { ThemePackGrid } from './components/ThemePackGrid';
import { useThemePackActions } from './hooks/useThemePackActions';
import { useThemePreferences } from './hooks/useThemePreferences';

/** 外观与主题：主题即时生效，无保存步骤 */
function AppearanceScreen() {
    const t = useT();
    const back = useBackAction();
    const { packs, selection } = useThemePreferences();
    const allPacks = [...BUILTIN_THEME_PACKS, ...packs];
    const actions = useThemePackActions(allPacks, selection);
    // 平板：单列限阅读宽，主题卡网格在列内按实际宽度算列数（手机 undefined，样式原样）
    const column = useContentColumn('reading');
    return (
        <Screen edges={['bottom']}>
            <AppBar
                title={t('appearance.title')}
                leading={back}
                contentWidth="reading"
            />
            <PaperPane width="reading">
                <ScrollView
                    contentContainerStyle={
                        column ? [styles.content, column] : styles.content
                    }
                >
                    <Section title={t('appearance.theme.section')}>
                        <ThemePackGrid
                            packs={allPacks}
                            selection={selection}
                            onSelect={actions.select}
                            onOpenMenu={actions.openMenu}
                            onCreate={actions.create}
                        />
                    </Section>
                    <Section title={t('appearance.mode.section')}>
                        <SystemModeSection
                            packs={allPacks}
                            selection={selection}
                            onToggleFollowSystem={actions.toggleFollowSystem}
                            onPickSlot={actions.pickSlot}
                        />
                    </Section>
                </ScrollView>
            </PaperPane>
        </Screen>
    );
}

const styles = StyleSheet.create({
    content: {
        width: '100%',
        maxWidth: layout.listContentMaxWidth,
        alignSelf: 'center',
        gap: space.xl,
        paddingTop: space.md,
        paddingBottom: space.xl,
    },
});

export default AppearanceScreen;
