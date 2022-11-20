import React, {useEffect, useRef, useState} from 'react';
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
import FolderItem from './folderItem';
import Empty from '@/components/base/empty';
import LocalMusicSheet from '@/core/localMusicSheet';
import useHardwareBack from '@/hooks/useHardwareBack';
import {useNavigation} from '@react-navigation/native';
import useDialog from '@/components/dialogs/useDialog';
import Toast from '@/utils/toast';
import Loading from '@/components/base/loading';

interface IPathItem {
    path: string;
    parent: null | IPathItem;
}

const ITEM_HEIGHT = rpx(96);

export default function ScanPage() {
    const [currentPath, setCurrentPath] = useState<IPathItem>({
        path: '/',
        parent: null,
    });
    const currentPathRef = useRef<IPathItem>(currentPath);
    const [folderData, setFolderData] = useState<string[]>([]);
    const [checkedPath, setCheckedPath] = useState<string[]>([]);
    const navigation = useNavigation();
    const {showDialog} = useDialog();
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
                                setFolderData(sdCardPaths);
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
                    const res = await readDir(currentPath.path);
                    setFolderData(
                        res.filter(_ => _.isDirectory()).map(_ => _.path),
                    );
                }
            } catch {
                setFolderData([]);
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

    return (
        <>
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
                <FlatList
                    ListEmptyComponent={Empty}
                    style={style.wrapper}
                    data={folderData}
                    getItemLayout={(_, index) => ({
                        length: ITEM_HEIGHT,
                        offset: ITEM_HEIGHT * index,
                        index,
                    })}
                    renderItem={({item}) => (
                        <FolderItem
                            folderPath={item}
                            parentPath={currentPath.path}
                            onItemPress={() => {
                                setCurrentPath(prev => ({
                                    parent: prev,
                                    path: item,
                                }));
                            }}
                            checked={checkedPath.includes(item)}
                            onCheckedChange={checked => {
                                setCheckedPath(prev => {
                                    if (checked) {
                                        return [...prev, item];
                                    } else {
                                        return prev.filter(_ => _ !== item);
                                    }
                                });
                            }}
                        />
                    )}
                />
            )}
            <Pressable
                onPress={() => {
                    showDialog('LoadingDialog', {
                        title: '扫描本地音乐',
                        promise: LocalMusicSheet.importLocal(checkedPath),
                        onResolve(data, hideDialog) {
                            Toast.success('导入成功~');
                            hideDialog();
                            navigation.goBack();
                        },
                        onCancel(hideDialog) {
                            LocalMusicSheet.cancelImportLocal();
                            hideDialog();
                        },
                    });
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
                            checkedPath.length > 0 ? 'normal' : 'secondary'
                        }>
                        开始扫描
                        {checkedPath?.length > 0
                            ? ` (选中${checkedPath.length})`
                            : ''}
                    </ThemeText>
                </View>
            </Pressable>
        </>
    );
}

const style = StyleSheet.create({
    header: {
        height: rpx(88),
        flexDirection: 'row',
        alignItems: 'center',
        width: rpx(750),
        paddingHorizontal: rpx(24),
    },
    headerPath: {
        marginLeft: rpx(28),
    },
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
    scanBtn: {
        width: rpx(750),
        height: rpx(120),
        alignItems: 'center',
        justifyContent: 'center',
    },
});
