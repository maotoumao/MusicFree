import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';

import { AppBar } from '@/components/layout/AppBar';
import { PaperPane } from '@/components/layout/PaperPane';
import { Screen } from '@/components/layout/Screen';
import { useLocalMusicList, useScanStatus } from '@/core/localMusic';
import { useBackAction } from '@/hooks/useBackAction';
import { useT } from '@/i18n';
import { stash } from '@/infra/stash';
import { MusicBar } from '@/widgets/MusicBar';

import { LocalMusicLibrary } from './components/LocalMusicLibrary';
import { PermissionGate } from './components/PermissionGate';
import { useLibraryInPane } from './hooks/useLibraryInPane';
import { useLibraryOverflowMenu } from './hooks/useLibraryOverflowMenu';
import { useRescanActive } from './hooks/useRescanActive';
import { useStorageReadAccess } from './hooks/useStorageReadAccess';
import {
    libraryViewAtom,
    rescanRequestedAtom,
    selectedCollectionAtom,
} from './store';

/**
 * 已授权分支：AppBar 带有库更多菜单（重新扫描 / 清空库）+ 库编排
 * overflow hook 仅此挂载——未授权时不订阅 libraryAtom，省去无谓的惰性 hydrate + 全库校验/排序
 */
function GrantedLibrary() {
    const t = useT();
    const back = useBackAction();
    const navigation = useNavigation();
    const overflow = useLibraryOverflowMenu();
    const setRescanRequested = useSetAtom(rescanRequestedAtom);
    const rescanActive = useRescanActive();
    const status = useScanStatus();
    const scanning = status === 'enumerating' || status === 'scanning';
    const view = useAtomValue(libraryViewAtom);
    const musicList = useLocalMusicList();
    /*
     * 分栏形态不走「纸 + 单列限宽」那套：PaperPane 的文档写明「分栏页与网格页不用」，
     * 顶栏的 contentWidth 同理——单列页用它把行内内容对齐到内容列，分栏页没有那一列
     */
    const inPane = useLibraryInPane();

    // 重扫控制台态：← 与硬件返回都「放弃重扫回列表」（清请求、不退页）；旧库一直在、仅被控制台覆盖
    useFocusEffect(
        useCallback(() => {
            if (!rescanActive) {
                return;
            }
            const sub = BackHandler.addEventListener(
                'hardwareBackPress',
                () => {
                    setRescanRequested(false);
                    return true;
                },
            );
            return () => sub.remove();
        }, [rescanActive, setRescanRequested]),
    );

    // 库内搜索：列表快照含插件私有字段、不可靠序列化 → 存 stash 只传 ticket
    const openSearch = useCallback(() => {
        const ticket = stash({
            musicList: [...musicList],
            itemOptionsSource: { kind: 'localLibrary' },
            title: t('localMusic.title'),
        });
        navigation.navigate('SearchInList', { ticket });
    }, [musicList, t, navigation]);

    // 扫描中不给返回箭头（取消统一走进度页按钮 / 硬件返回、均二次确认，避免 ← 绕过确认后台留扫描）
    // 重扫态 ← 放弃重扫回列表；否则普通退页
    const leading = scanning
        ? undefined
        : rescanActive
        ? {
              icon: 'chevron-left' as const,
              label: t('common.back'),
              onPress: () => setRescanRequested(false),
          }
        : back;
    // 搜索只在「全部」页给：其余 Tab 是集合列表，搜索入口在各集合详情页内
    const showSearch =
        !scanning && !rescanActive && view === 'all' && musicList.length > 0;
    return (
        <>
            <AppBar
                title={t('localMusic.title')}
                leading={leading}
                contentWidth={inPane ? undefined : 'list'}
                actions={
                    showSearch
                        ? [
                              {
                                  icon: 'search',
                                  label: t('common.search'),
                                  onPress: openSearch,
                              },
                          ]
                        : undefined
                }
                overflow={scanning || rescanActive ? undefined : overflow}
            />
            {inPane ? (
                <View style={styles.content}>
                    <LocalMusicLibrary />
                </View>
            ) : (
                <PaperPane width="list">
                    <View style={styles.content}>
                        <LocalMusicLibrary />
                    </View>
                </PaperPane>
            )}
        </>
    );
}

/**
 * 本地音乐页：权限门 + 库编排壳
 * 未授权显示用途说明并跳系统设置；已授权进 GrantedLibrary
 * status 为 undefined 时正在查询权限，内容槽留空不闪任何态
 * 底部安全区由 MusicBar 独占（Screen edges 不含 bottom），避免与 MusicBar 自身 inset 叠加
 */
export default function LocalMusicScreen() {
    const t = useT();
    const back = useBackAction();
    const navigation = useNavigation();
    const { status, requesting, request } = useStorageReadAccess();
    const setRescanRequested = useSetAtom(rescanRequestedAtom);
    const setLibraryView = useSetAtom(libraryViewAtom);
    const setSelectedCollection = useSetAtom(selectedCollectionAtom);

    // 离开本地音乐页时复位模块级 atom（重扫请求、Tab 选择态、分栏选中集合），避免残留到下次进入
    useEffect(
        () => () => {
            setRescanRequested(false);
            setLibraryView('all');
            setSelectedCollection(null);
        },
        [setRescanRequested, setLibraryView, setSelectedCollection],
    );

    return (
        <Screen edges={[]}>
            {status === 'granted' ? (
                <GrantedLibrary />
            ) : (
                <>
                    <AppBar
                        title={t('localMusic.title')}
                        leading={back}
                        contentWidth="list"
                    />
                    <View style={styles.content}>
                        {status === undefined ? null : (
                            <PermissionGate
                                requesting={requesting}
                                onGrant={request}
                                onDismiss={() => navigation.goBack()}
                            />
                        )}
                    </View>
                </>
            )}
            <MusicBar />
        </Screen>
    );
}

const styles = StyleSheet.create({
    content: {
        flex: 1,
    },
});
