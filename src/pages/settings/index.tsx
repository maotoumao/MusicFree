import { useRoute, type RouteProp } from '@react-navigation/native';
import { useAtom } from 'jotai';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppBar } from '@/components/layout/AppBar';
import { Screen } from '@/components/layout/Screen';
import { layout, space } from '@/design';
import { useBackAction } from '@/hooks/useBackAction';
import { useContentColumn } from '@/hooks/useContentColumn';
import { useLayoutClass } from '@/hooks/useLayoutClass';
import { useT } from '@/i18n';

import { SettingsNavPane } from './components/SettingsNavPane';
import {
    PLAYBACK_SECTION,
    SETTINGS_SECTIONS,
    VISIBLE_SETTINGS_SECTIONS,
} from './lib/sections';
import { activeSectionAtom } from './store';

/**
 * 路由参数：目录浏览器选完下载目录后经此回传
 * 真正消费它的是「下载」分区里的 hook（那才是这一行自己的事）；本屏只读一眼来把当前
 * 分区切过去——平板横屏只渲染当前分区，不切的话那个 hook 不在场，这次选择就没人接
 */
export type SettingsParams = {
    pickedDownloadDir?: string;
};

/**
 * 设置页：手机 / 平板竖屏一列到底（分区顺序见 lib/sections）；
 * 平板横屏左栏分区目录 + 右栏当前分区（与 iPad 设置一致，见 docs/交接-轮13平板适配.md S3）
 */
export default function SettingsScreen() {
    const t = useT();
    const back = useBackAction();
    const layoutClass = useLayoutClass();
    // 平板竖屏：单列限阅读宽（手机 undefined，styles.content 原样）
    const column = useContentColumn('reading');
    // 横屏右栏：分区行自带 16 内距，列再补 16 → 内容线 32；封顶取媒体行档（设置行是 label + 控件，不是散文）
    const paneColumn = useContentColumn('list');
    const [activeKey, setActiveKey] = useAtom(activeSectionAtom);
    const route =
        useRoute<
            RouteProp<{ Settings: SettingsParams | undefined }, 'Settings'>
        >();
    // 目录浏览器把选中的下载目录回传到本屏，而消费它的 hook 住在「下载」分区里；
    // 平板横屏只渲染当前分区，故带着回传参数回来时先把分区切过去，否则这次选择没人接
    const pickedDownloadDir = route.params?.pickedDownloadDir;
    useEffect(() => {
        // 只有横屏才需要：其余布局一列到底、各分区都在场，改这个共享状态属于多余副作用
        if (
            pickedDownloadDir !== undefined &&
            layoutClass === 'tabletLandscape'
        ) {
            setActiveKey('download');
        }
    }, [pickedDownloadDir, layoutClass, setActiveKey]);

    if (layoutClass === 'tabletLandscape') {
        // 选中项在当前平台不可见（如 iOS 上的权限分区）→ 回落首个可见分区
        const active =
            VISIBLE_SETTINGS_SECTIONS.find(s => s.key === activeKey) ??
            PLAYBACK_SECTION;
        return (
            <Screen edges={['bottom']}>
                <AppBar title={t('settings.title')} leading={back} />
                <View style={styles.panes}>
                    <SettingsNavPane
                        sections={VISIBLE_SETTINGS_SECTIONS}
                        activeKey={active.key}
                        onSelect={setActiveKey}
                    />
                    <ScrollView
                        // key：换分区回到顶部，不继承上一分区的滚动位
                        key={active.key}
                        style={styles.pane}
                        contentContainerStyle={[styles.paneContent, paneColumn]}
                    >
                        <active.Component />
                    </ScrollView>
                </View>
            </Screen>
        );
    }

    return (
        <Screen edges={['bottom']}>
            <AppBar
                title={t('settings.title')}
                leading={back}
                contentWidth="reading"
            />
            <ScrollView
                contentContainerStyle={
                    column ? [styles.content, column] : styles.content
                }
            >
                {SETTINGS_SECTIONS.map(section => (
                    <section.Component key={section.key} />
                ))}
            </ScrollView>
        </Screen>
    );
}

const styles = StyleSheet.create({
    content: {
        paddingBottom: space.xl,
        // 分区之间留白：标题要离上一分区的末行足够远，才读得出「新的一组」
        gap: space.lg,
        // 手机横屏沿用旧的 640 限宽居中；平板由 useContentColumn 覆盖为 reading 列
        width: '100%',
        maxWidth: layout.listContentMaxWidth,
        alignSelf: 'center',
    },
    panes: {
        flex: 1,
        flexDirection: 'row',
    },
    pane: {
        flex: 1,
        minWidth: 0,
    },
    paneContent: {
        paddingTop: space.md,
        paddingBottom: space.xl,
    },
});
