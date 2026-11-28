import { useRoute, type RouteProp } from '@react-navigation/native';
import { useAtomValue } from 'jotai';
import { useEffect, useState, type ReactNode } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';

import { AppBar } from '@/components/layout/AppBar';
import { Screen } from '@/components/layout/Screen';
import { ContentUnavailable } from '@/components/ui/ContentUnavailable';
import { Loading } from '@/components/ui/Loading';
import { chromeIsDarkAtom } from '@/design';
import { useBackAction } from '@/hooks/useBackAction';
import { useT } from '@/i18n';
import { claim } from '@/infra/stash';
import { MusicBar } from '@/widgets/MusicBar';

import { ArtistWorksScaffold } from './components/ArtistWorksScaffold';
import { useArtistDetailSource } from './hooks/useArtistDetailSource';
import { resolveBoundary } from './lib/boundary';

import type { ArtistItem } from '@/types';

/** 歌手详情页路由参数：stash ticket（ArtistItem 含插件私有字段、不可靠序列化，故存 stash 只传取件号） */
export type ArtistDetailParams = { ticket: string };

/**
 * 插件歌手详情页：ticket 取回 ArtistItem → useArtistDetailSource 组装两类作品 → 沉浸封面 + 点选 Tab
 * ready 走 ArtistWorksScaffold（封面进列表 + Tabs 浮层吸顶 + 双列表条件渲染）；边界态用静态 AppBar 页占位
 */
export default function ArtistDetailScreen() {
    const route =
        useRoute<
            RouteProp<{ ArtistDetail: ArtistDetailParams }, 'ArtistDetail'>
        >();
    const { ticket } = route.params;
    // claim 破坏性（读即删）：放提交后 effect 做、渲染期保持纯净；键 ticket 支持同屏换参重领
    const [claimed, setClaimed] = useState<{
        ticket: string;
        item: ArtistItem | undefined;
    }>();
    useEffect(() => {
        setClaimed({ ticket, item: claim<ArtistItem>(ticket) });
    }, [ticket]);
    const matched = claimed?.ticket === ticket ? claimed : undefined;

    // 本屏全程自管 StatusBar：ready 由 scaffold 的 ImmersiveAppBar 渲染，边界态由 StaticFrame 渲染
    return (
        <Screen edges={[]} statusBar={false}>
            {/* key=ticket：同屏换歌手时重挂内容子树，随之重置 tab 选择 / album 探测等本地态 */}
            <ArtistDetailContent
                key={ticket}
                item={matched?.item}
                pending={!matched}
            />
            <MusicBar />
        </Screen>
    );
}

/** 歌手作品内容：以 key=ticket 挂载，本地态（activeType / album 探测）随歌手切换自然重置 */
function ArtistDetailContent({
    item,
    pending,
}: {
    item: ArtistItem | undefined;
    pending: boolean;
}) {
    const t = useT();
    const source = useArtistDetailSource(item, pending);
    const back = useBackAction();
    // 边界态用静态 surface 框架；顶栏可能是半透明的，明暗只能问合成后的 chrome，
    // 直接对 surface 求明暗会在「浅色顶栏 + 深壁纸」上判反，交出深图标压深底
    const chromeIsDark = useAtomValue(chromeIsDarkAtom);
    const surfaceBarStyle = chromeIsDark ? 'light-content' : 'dark-content';

    // 仍在领取 ticket：静态框架 + 居中 loading（ArtistItem 尚未 claim、无 header 数据）
    if (pending) {
        return (
            <StaticFrame back={back} barStyle={surfaceBarStyle}>
                <Loading />
            </StaticFrame>
        );
    }
    // 失效 / 不可用 / 首屏失败 / 全空 → 静态框架内居中 ContentUnavailable（据态给图标 + 文案 + 重试）
    const boundary = resolveBoundary(item, source, t);
    if (boundary) {
        return (
            <StaticFrame back={back} barStyle={surfaceBarStyle}>
                <ContentUnavailable {...boundary} />
            </StaticFrame>
        );
    }
    // loading（首屏拉取）/ ready → 作品编排；封面 + 列表加载 / 空态都在 scaffold 内
    return <ArtistWorksScaffold source={source} onBack={back.onPress} />;
}

/** 边界态静态框架：自渲染 StatusBar（本屏 Screen 不渲染）+ 返回 AppBar + 居中内容 */
function StaticFrame({
    back,
    barStyle,
    children,
}: {
    back: { icon: 'chevron-left'; label: string; onPress: () => void };
    barStyle: 'light-content' | 'dark-content';
    children: ReactNode;
}) {
    return (
        <View style={styles.body}>
            <StatusBar
                translucent
                backgroundColor="transparent"
                barStyle={barStyle}
            />
            <AppBar leading={back} />
            <View style={styles.fill}>{children}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    body: { flex: 1 },
    fill: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
