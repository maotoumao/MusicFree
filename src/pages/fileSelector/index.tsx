import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from '@/components/base/themeText';
import {
    ExternalStorageDirectoryPath,
    readDir,
    getAllExternalFilesDirs,
    exists,
} from 'react-native-fs';
import {FlatList} from 'react-native-gesture-handler';
import useColors from '@/hooks/useColors';
import Color from 'color';
import IconButton from '@/components/base/iconButton';
import FileItem from './fileItem';
import Empty from '@/components/base/empty';
import useHardwareBack from '@/hooks/useHardwareBack';
import {useNavigation} from '@react-navigation/native';
import Loading from '@/components/base/loading';
import {useParams} from '@/entry/router';
import StatusBar from '@/components/base/statusBar';
import VerticalSafeAreaView from '@/components/base/verticalSafeAreaView';
import globalStyle from '@/constants/globalStyle';

interface IPathItem {
    path: string;
    parent: null | IPathItem;
}

interface IFileItem {
    path: string;
    type: 'file' | 'folder';
}

const ITEM_HEIGHT = rpx(96);

export default function FileSelector() {
    const {
        fileType = 'file-and-folder',
        multi = true,
        actionText = '确定',
        matchExtension,
        onAction,
    } = useParams<'file-selector'>() ?? {};

    const [currentPath, setCurrentPath] = useState<IPathItem>({
        path: '/',
        parent: null,
    });
    const currentPathRef = useRef<IPathItem>(currentPath);
    const [filesData, setFilesData] = useState<IFileItem[]>([]);
    const [checkedItems, setCheckedItems] = useState<IFileItem[]>([]);

    const checkedPaths = useMemo(
        () => checkedItems.map(_ => _.path),
        [checkedItems],
    );
    const navigation = useNavigation();
    const colors = useColors();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        (async () => {
            // 路径变化时，重新读取
            setLoading(true);
            try {
                if (currentPath.path === '/') {
                    try {
                        const allExt = await getAllExternalFilesDirs();
                        if (allExt.length > 1) {
                            const sdCardPaths = allExt.map(sdp =>
                                sdp.substring(0, sdp.indexOf('/Android')),
                            );
                            if (
                                (
                                    await Promise.all(
                                        sdCardPaths.map(_ => exists(_)),
                                    )
                                ).every(val => val)
                            ) {
                                setFilesData(
                                    sdCardPaths.map(_ => ({
                                        type: 'folder',
                                        path: _,
                                    })),
                                );
                            }
                        } else {
                            setCurrentPath({
                                path: ExternalStorageDirectoryPath,
                                parent: null,
                            });
                            return;
                        }
                    } catch {
                        setCurrentPath({
                            path: ExternalStorageDirectoryPath,
                            parent: null,
                        });
                        return;
                    }
                } else {
                    const res = (await readDir(currentPath.path)) ?? [];
                    let folders: IFileItem[] = [];
                    let files: IFileItem[] = [];
                    if (
                        fileType === 'folder' ||
                        fileType === 'file-and-folder'
                    ) {
                        folders = res
                            .filter(_ => _.isDirectory())
                            .map(_ => ({
                                type: 'folder',
                                path: _.path,
                            }));
                    }
                    if (fileType === 'file' || fileType === 'file-and-folder') {
                        files = res
                            .filter(
                                _ =>
                                    _.isFile() &&
                                    (matchExtension
                                        ? matchExtension(_.path)
                                        : true),
                            )
                            .map(_ => ({
                                type: 'file',
                                path: _.path,
                            }));
                    }
                    setFilesData([...folders, ...files]);
                }
            } catch {
                setFilesData([]);
            }
            setLoading(false);
            currentPathRef.current = currentPath;
        })();
    }, [currentPath.path]);

    useHardwareBack(() => {
        // 注意闭包
        const _currentPath = currentPathRef.current;
        if (_currentPath.parent !== null) {
            setCurrentPath(_currentPath.parent);
        } else {
            navigation.goBack();
        }
        return true;
    });

    const selectPath = useCallback((item: IFileItem, nextChecked: boolean) => {
        if (multi) {
            setCheckedItems(prev => {
                if (nextChecked) {
                    return [...prev, item];
                } else {
                    return prev.filter(_ => _ !== item);
                }
            });
        } else {
            setCheckedItems(nextChecked ? [item] : []);
        }
    }, []);

    const renderItem = ({item}: {item: IFileItem}) => (
        <FileItem
            path={item.path}
            type={item.type}
            parentPath={currentPath.path}
            onItemPress={currentChecked => {
                if (item.type === 'folder') {
                    setCurrentPath(prev => ({
                        parent: prev,
                        path: item.path,
                    }));
                } else {
                    selectPath(item, !currentChecked);
                }
            }}
            checked={checkedPaths.includes(item.path)}
            onCheckedChange={checked => {
                selectPath(item, checked);
            }}
        />
    );

    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <StatusBar />
            <View style={[style.header, {backgroundColor: colors.primary}]}>
                <IconButton
                    size="small"
                    name="keyboard-backspace"
                    onPress={() => {
                        // 返回上一级
                        if (currentPath.parent !== null) {
                            setCurrentPath(currentPath.parent);
                        }
                    }}
                />
                <ThemeText
                    numberOfLines={2}
                    ellipsizeMode="head"
                    style={style.headerPath}>
                    {currentPath.path}
                </ThemeText>
            </View>
            {loading ? (
                <Loading />
            ) : (
                <>
                    <FlatList
                        ListEmptyComponent={Empty}
                        style={globalStyle.fwflex1}
                        data={filesData}
                        getItemLayout={(_, index) => ({
                            length: ITEM_HEIGHT,
                            offset: ITEM_HEIGHT * index,
                            index,
                        })}
                        renderItem={renderItem}
                    />
                </>
            )}
            <Pressable
                onPress={async () => {
                    if (checkedItems.length) {
                        const shouldBack = await onAction?.(checkedItems);
                        if (shouldBack) {
                            navigation.goBack();
                        }
                    }
                }}>
                <View
                    style={[
                        style.scanBtn,
                        {
                            backgroundColor: Color(colors.primary)
                                .alpha(0.8)
                                .toString(),
                        },
                    ]}>
                    <ThemeText
                        fontColor={
                            checkedItems.length > 0 ? 'normal' : 'secondary'
                        }>
                        {actionText}
                        {multi && checkedItems?.length > 0
                            ? ` (选中${checkedItems.length})`
                            : ''}
                    </ThemeText>
                </View>
            </Pressable>
        </VerticalSafeAreaView>
    );
}

const style = StyleSheet.create({
    header: {
        height: rpx(88),
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        paddingHorizontal: rpx(24),
    },
    headerPath: {
        marginLeft: rpx(28),
    },
    scanBtn: {
        width: '100%',
        height: rpx(120),
        alignItems: 'center',
        justifyContent: 'center',
    },
});
