import React from 'react';
import LocalMusicSheet from '@/core/localMusicSheet';
import {ROUTE_PATH, useNavigate} from '@/entry/router';
import LocalMusicList from './localMusicList';
import MusicBar from '@/components/musicBar';
import {localMusicSheetId} from '@/constants/commonConst';
import Toast from '@/utils/toast';
import {showDialog} from '@/components/dialogs/useDialog';
import AppBar from '@/components/base/appBar';

export default function MainPage() {
    const navigate = useNavigate();
    return (
        <>
            <AppBar
                withStatusBar
                actions={[
                    {
                        icon: 'magnifying-glass',
                        onPress() {
                            navigate(ROUTE_PATH.SEARCH_MUSIC_LIST, {
                                musicList: LocalMusicSheet.getMusicList(),
                            });
                        },
                    },
                ]}
                menu={[
                    {
                        icon: 'magnifying-glass',
                        title: '扫描本地音乐',
                        async onPress() {
                            navigate(ROUTE_PATH.FILE_SELECTOR, {
                                fileType: 'folder',
                                multi: true,
                                actionText: '开始扫描',
                                async onAction(selectedFiles) {
                                    return new Promise(resolve => {
                                        showDialog('LoadingDialog', {
                                            title: '扫描本地音乐',
                                            promise:
                                                LocalMusicSheet.importLocal(
                                                    selectedFiles.map(
                                                        _ => _.path,
                                                    ),
                                                ),
                                            onResolve(data, hideDialog) {
                                                Toast.success('导入成功~');
                                                hideDialog();
                                                resolve(true);
                                            },
                                            onCancel(hideDialog) {
                                                LocalMusicSheet.cancelImportLocal();
                                                hideDialog();
                                                resolve(false);
                                            },
                                        });
                                    });
                                },
                            });
                        },
                    },
                    {
                        icon: 'pencil-square',
                        title: '批量编辑',
                        async onPress() {
                            navigate(ROUTE_PATH.MUSIC_LIST_EDITOR, {
                                musicList: LocalMusicSheet.getMusicList(),
                                musicSheet: {
                                    id: localMusicSheetId,
                                },
                            });
                        },
                    },
                    {
                        icon: 'arrow-down-tray',
                        title: '下载列表',
                        async onPress() {
                            navigate(ROUTE_PATH.DOWNLOADING);
                        },
                    },
                ]}>
                本地音乐
            </AppBar>
            <LocalMusicList />
            <MusicBar />
        </>
    );
}
