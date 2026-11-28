import { useNavigation } from '@react-navigation/native';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import {
    localMusic,
    useHasLibrarySnapshot,
    useLocalMusicList,
    useScanStatus,
} from '@/core/localMusic';
import { substrateColorAtom } from '@/design';

import { useRescanActive } from '../hooks/useRescanActive';
import { useScanFeedback } from '../hooks/useScanFeedback';
import { rescanRequestedAtom } from '../store';

import { LocalLibraryViews } from './LocalLibraryViews';
import { ScanGateView } from './ScanGateView';
import { ScanProgressView } from './ScanProgressView';

/**
 * 已授权后的库编排：显式扫描（不自动）+ 完整扫描状态矩阵
 * library 经 atomWithLazy 首渲即同步 hydrate，有库首渲直接列表、零闪
 * 有库时 Tab 列表常挂载保活，扫描中全屏进度 / 重扫控制台作不透明覆盖层叠加（保留 Tab/滚动）
 * 无库：从未扫描→控制台首次态；扫描中→全屏进度；终态（完成空/失败/取消）→控制台上次结果态
 */
export function LocalMusicLibrary() {
    // 覆盖层铺页面基底的实际颜色：不透明、不吃控件不透明度，壁纸场景下也与周围同一色调
    const substrateColor = useAtomValue(substrateColorAtom);
    const navigation = useNavigation();
    const musicList = useLocalMusicList();
    const status = useScanStatus();
    const hasSnapshot = useHasLibrarySnapshot();
    const hasLibrary = musicList.length > 0;
    const scanning = status === 'enumerating' || status === 'scanning';
    const rescanRequested = useAtomValue(rescanRequestedAtom);
    const setRescanRequested = useSetAtom(rescanRequestedAtom);
    const rescanActive = useRescanActive();

    useScanFeedback(status, hasLibrary);

    // 清陈旧重扫请求：进入扫描 / 无库时请求已无意义（管理页开始扫描返回、清空库等路径），收敛掉残留
    useEffect(() => {
        if (rescanRequested && (scanning || !hasLibrary)) {
            setRescanRequested(false);
        }
    }, [rescanRequested, scanning, hasLibrary, setRescanRequested]);

    // 页面内「开始扫描 / 重试」入口：同步清重扫请求 + 触发扫描（避免重扫态点开始后闪一帧控制台）
    const startScan = useCallback(() => {
        setRescanRequested(false);
        localMusic.startScan();
    }, [setRescanRequested]);
    const manageScanRange = useCallback(() => {
        navigation.navigate('ScanSettings');
    }, [navigation]);

    // 无库 + 扫描中（首次扫描）：独立全屏进度（无列表可保活）
    if (scanning && !hasLibrary) {
        return <ScanProgressView />;
    }

    // 有库：Tab 列表常挂载保活（保留 Tab/滚动）；扫描中→全屏进度、重扫态→控制台，均作不透明覆盖层叠加、屏蔽底层
    if (hasLibrary) {
        const overlay = scanning ? (
            <ScanProgressView />
        ) : rescanActive ? (
            <ScanGateView
                context={{ kind: 'rescan', count: musicList.length }}
                onStart={startScan}
                onManage={manageScanRange}
            />
        ) : null;
        return (
            <View style={styles.fill}>
                <View
                    style={styles.fill}
                    pointerEvents={overlay ? 'none' : 'auto'}
                    importantForAccessibility={
                        overlay ? 'no-hide-descendants' : 'auto'
                    }
                    accessibilityElementsHidden={overlay != null}
                >
                    <LocalLibraryViews />
                </View>
                {overlay ? (
                    <View
                        style={[
                            StyleSheet.absoluteFill,
                            // 不能铺 surface：壁纸场景下它是半透明的，底层列表会透进进度文字里
                            { backgroundColor: substrateColor },
                        ]}
                    >
                        {overlay}
                    </View>
                ) : null}
            </View>
        );
    }

    // 无库 + idle + 无 snapshot（从未扫描）→ 控制台首次态
    if (status === 'idle' && !hasSnapshot) {
        return (
            <ScanGateView
                context={{ kind: 'first' }}
                onStart={startScan}
                onManage={manageScanRange}
            />
        );
    }

    // 无库 + 终态（完成空 / 失败 / 取消）→ 控制台上次结果态（统一，不再各自 ContentUnavailable）
    const reason =
        status === 'failed'
            ? 'failed'
            : status === 'cancelled'
            ? 'cancelled'
            : 'empty';
    return (
        <ScanGateView
            context={{ kind: 'lastResult', reason }}
            onStart={startScan}
            onManage={manageScanRange}
        />
    );
}

const styles = StyleSheet.create({
    fill: { flex: 1 },
});
