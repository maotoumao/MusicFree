import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/layout/Screen';
import { useCurrentMusic } from '@/core/player';
import { layout, space } from '@/design';
import { useT } from '@/i18n';
import { mediaKey } from '@/utils/media';

import {
    PLAYER_WIDE_NAV_ROW,
    playerCoverMaxSizeFor,
    playerLeadWidthFor,
    WIDE_OUTER_GUTTER,
} from '../lib/layout';

import { Backdrop } from './Backdrop';
import { CoverStage } from './CoverStage';
import { CoverTools } from './CoverTools';
import { KeepScreenAwake } from './KeepScreenAwake';
import { LyricTools } from './LyricTools';
import { LyricView } from './LyricView';
import { NowPlayingNav } from './NowPlayingNav';
import { PlayControls } from './PlayControls';
import { Progress } from './Progress';

/**
 * 正在播放页·平板横屏：封面与歌词并排，不再左右翻页
 *
 * 左栏（playerLeadWidth，窄折叠屏收到半宽）= 手机封面页原样堆叠：封面 · 标题 · 封面工具行 · 进度 · 控件；
 * 右栏 = 手机歌词页原样堆叠：歌词画布满高 · 歌词工具行贴底。两栏底部同一基线，各自就是一个完整的「手机页」。
 * 顶栏不再显示「封面 / 歌词」切换；「播放页默认显示」设置在此形态下无效但保留。
 */
export function NowPlayingWide() {
    const insets = useSafeAreaInsets();
    const t = useT();
    const current = useCurrentMusic();
    const { width } = useWindowDimensions();
    // NowPlayingNav 的下划线靠这个位置值驱动；无切换时恒 0、不会被读到
    const navPosition = useSharedValue(0);

    const leadWidth = playerLeadWidthFor(width);
    const coverMaxSize = playerCoverMaxSizeFor(leadWidth);
    const artwork = current?.artwork;
    const title = current?.title ?? t('media.unknownTitle');
    const key = current ? mediaKey(current) : 'none';

    return (
        <Screen background="coverVeil" edges={[]}>
            <KeepScreenAwake />
            <Backdrop artwork={artwork} />
            <View
                style={[
                    styles.content,
                    { paddingTop: insets.top, paddingBottom: insets.bottom },
                ]}
            >
                <NowPlayingNav
                    position={navPosition}
                    mode="cover"
                    onModeChange={noop}
                    showModeSwitch={false}
                    rowStyle={PLAYER_WIDE_NAV_ROW}
                />
                {/* 左右安全区由 Screen 的 SafeAreaView 恒缩，这里只留外内距 */}
                <View style={styles.columns}>
                    <View style={[styles.pane, { width: leadWidth }]}>
                        <CoverStage
                            artwork={artwork}
                            title={title}
                            artist={current?.artist}
                            platform={current?.platform}
                            maxSize={coverMaxSize}
                        />
                        <CoverTools />
                        <View style={styles.transport}>
                            <Progress key={key} />
                            <PlayControls />
                        </View>
                    </View>
                    <View style={[styles.pane, styles.lyricPane]}>
                        <LyricView key={key} />
                        <LyricTools />
                    </View>
                </View>
            </View>
        </Screen>
    );
}

function noop() {}

const styles = StyleSheet.create({
    content: {
        flex: 1,
    },
    columns: {
        flex: 1,
        flexDirection: 'row',
        gap: space['3xl'],
        paddingHorizontal: WIDE_OUTER_GUTTER,
        paddingBottom: space.xl,
    },
    // 每栏自留手机档内距：工具行用 -screenGutter 的负外距满幅铺开，靠的就是这一段
    pane: {
        paddingHorizontal: layout.screenGutter,
        gap: space.md,
    },
    lyricPane: {
        flex: 1,
        minWidth: 0,
    },
    // 进度 + 控件：CoverStage 的 flex:1 吃掉剩余高度，本块自然贴底，与右栏贴底的歌词工具行同一基线
    transport: {
        gap: space.lg,
    },
});
