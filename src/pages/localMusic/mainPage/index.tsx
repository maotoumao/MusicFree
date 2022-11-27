import React from 'react';
import ComplexAppBar from '@/components/base/ComplexAppBar';
import LocalMusicSheet from '@/core/localMusicSheet';
import {ROUTE_PATH, useNavigate} from '@/entry/router';
import LocalMusicList from './localMusicList';
import MusicBar from '@/components/musicBar';
import {localMusicSheetId} from '@/constants/commonConst';
import useDialog from '@/components/dialogs/useDialog';
import Toast from '@/utils/toast';

export default function MainPage() {
    const navigate = useNavigate();
    const {showDialog} = useDialog();
    return (
        <>
            <ComplexAppBar
                title="本地音乐"
                onSearchPress={() => {
                    navigate(ROUTE_PATH.SEARCH_MUSIC_LIST, {
                        musicList: LocalMusicSheet.getMusicList(),
                    });
                }}
                menuOptions={[
                    {
                        icon: 'magnify',
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
                        icon: 'playlist-edit',
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
                ]}
            />
            <LocalMusicList />
            <MusicBar />
        </>
    );
}
