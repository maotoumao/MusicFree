import {
    StackActions,
    useFocusEffect,
    useNavigation,
    useRoute,
    type RouteProp,
} from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';

import { AppBar } from '@/components/layout/AppBar';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { ContentUnavailable } from '@/components/ui/ContentUnavailable';
import { Icon } from '@/components/ui/Icon';
import { ListItem } from '@/components/ui/ListItem';
import { Loading } from '@/components/ui/Loading';
import { Text } from '@/components/ui/Text';
import { borderWidth, space, useColors } from '@/design';
import { useT } from '@/i18n';

import { DirectoryBreadcrumb } from './components/DirectoryBreadcrumb';
import { useDirectoryListing } from './hooks/useDirectoryListing';
import { storageRootLabel } from './lib/storageRootLabel';

import type { DirEntry } from '@/infra/fileBrowser';

/**
 * 选中目录的用途：决定回传给谁、写进哪儿
 * 浏览器自己不认识这些业务含义，只负责按 purpose 把路径送回对应的页
 */
export type DirectoryPurpose = 'scanIncluded' | 'scanExcluded' | 'downloadDir';

/** 目录浏览器路由参数 */
export type DirectoryBrowserParams = {
    purpose: DirectoryPurpose;
};

function keyExtractor(item: DirEntry): string {
    return item.path;
}

/**
 * 应用内目录浏览器：从存储根逐层进入，选一个真实目录返回
 * path 栈驱动层级：空栈=常用位置（存储根）；返回键先退上级、到根再退出页面
 * 不请求或持久化 SAF 授权——全文件访问已提供真实路径
 */
export default function DirectoryBrowserScreen() {
    const t = useT();
    const colors = useColors();
    const navigation = useNavigation();
    const route =
        useRoute<
            RouteProp<
                { DirectoryBrowser: DirectoryBrowserParams },
                'DirectoryBrowser'
            >
        >();
    // purpose 决定选中目录回传给谁（扫描范围页 / 设置页）
    const { purpose } = route.params;

    // 目录栈：空 = 常用位置（存储根）视图；栈顶 = 当前目录（存 {name,path} 供面包屑逐段回跳）
    const [pathStack, setPathStack] = useState<readonly DirEntry[]>([]);
    const currentPath = pathStack[pathStack.length - 1]?.path;

    const { data: dirs, isLoading } = useDirectoryListing(currentPath);

    const enterFolder = useCallback((dir: DirEntry) => {
        setPathStack(prev => [...prev, dir]);
    }, []);

    // 面包屑跳转：index<0 回常用位置（根）；否则裁到该层
    const navigateToCrumb = useCallback((index: number) => {
        setPathStack(prev => (index < 0 ? [] : prev.slice(0, index + 1)));
    }, []);

    // 返回：栈内先退上级返回 true 拦截；到根（栈空）返回 false 交默认 goBack 出页
    const handleBack = useCallback((): boolean => {
        if (pathStack.length === 0) {
            return false;
        }
        setPathStack(prev => prev.slice(0, -1));
        return true;
    }, [pathStack.length]);

    // AppBar 返回箭头：退栈或出页
    const onLeadingBack = useCallback(() => {
        if (!handleBack()) {
            navigation.goBack();
        }
    }, [handleBack, navigation]);

    // Android 硬件返回键：聚焦时拦截，逻辑同返回箭头
    useFocusEffect(
        useCallback(() => {
            const sub = BackHandler.addEventListener(
                'hardwareBackPress',
                handleBack,
            );
            return () => sub.remove();
        }, [handleBack]),
    );

    // 选择当前目录：按 purpose 回传给对应的页
    const selectCurrent = useCallback(() => {
        if (currentPath === undefined) {
            return;
        }
        // popTo 回栈中已存在的那一页（RN Nav 7 的 navigate 不会 pop 到已存在、会压新页）；merge 合并回传参数
        navigation.dispatch(
            purpose === 'downloadDir'
                ? StackActions.popTo(
                      'Settings',
                      { pickedDownloadDir: currentPath },
                      { merge: true },
                  )
                : StackActions.popTo(
                      'ScanSettings',
                      {
                          pickedDir: currentPath,
                          pickedTarget:
                              purpose === 'scanIncluded'
                                  ? 'included'
                                  : 'excluded',
                      },
                      { merge: true },
                  ),
        );
    }, [currentPath, purpose, navigation]);

    const renderRow = useCallback(
        ({ item }: { item: DirEntry }) => {
            // 存储根（带卷身份）的名交 i18n / 系统卷名；子目录用其真实名
            const label = item.volume ? storageRootLabel(item, t) : item.name;
            return (
                <ListItem
                    leading={<Icon name="folder-open" color="textSecondary" />}
                    title={<Text numberOfLines={1}>{label}</Text>}
                    subtitle={
                        currentPath === undefined ? (
                            <Text
                                size="sm"
                                color="textSecondary"
                                numberOfLines={1}
                            >
                                {item.path}
                            </Text>
                        ) : undefined
                    }
                    onPress={() => enterFolder(item)}
                    accessibilityLabel={t(
                        'scanSettings.picker.a11y.enterFolder',
                        { name: label },
                    )}
                />
            );
        },
        [currentPath, enterFolder, t],
    );

    const leading = {
        icon: 'chevron-left' as const,
        label: t('common.back'),
        onPress: onLeadingBack,
    };

    return (
        <Screen edges={['bottom']}>
            <AppBar title={t('scanSettings.picker.title')} leading={leading} />
            <DirectoryBreadcrumb
                stack={pathStack}
                onNavigate={navigateToCrumb}
            />
            {isLoading ? (
                <Loading variant="fullscreen" />
            ) : (
                <FlashList
                    data={dirs}
                    keyExtractor={keyExtractor}
                    renderItem={renderRow}
                    ListEmptyComponent={
                        <ContentUnavailable
                            icon="inbox"
                            title={t('scanSettings.picker.empty')}
                            style={styles.fill}
                        />
                    }
                    contentContainerStyle={
                        dirs != null && dirs.length === 0
                            ? styles.emptyContent
                            : undefined
                    }
                />
            )}
            {currentPath !== undefined ? (
                <View
                    style={[
                        styles.applyBar,
                        {
                            borderTopColor: colors.border,
                            backgroundColor: colors.surface,
                        },
                    ]}
                >
                    <Text
                        size="sm"
                        color="textSecondary"
                        numberOfLines={1}
                        style={styles.applyPath}
                    >
                        {currentPath}
                    </Text>
                    <Button onPress={selectCurrent}>
                        {t('scanSettings.picker.selectThisFolder')}
                    </Button>
                </View>
            ) : null}
        </Screen>
    );
}

const styles = StyleSheet.create({
    fill: { flex: 1 },
    emptyContent: { flexGrow: 1 },
    applyBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderTopWidth: borderWidth.hairline,
    },
    applyPath: { flex: 1 },
});
