import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import DocumentPicker from 'react-native-document-picker';
import ListItem from '@/components/base/listItem';
import Toast from '@/utils/toast';
import Backup from '@/core/backup';
import {readFile, writeFile} from 'react-native-fs';
import {ROUTE_PATH, useNavigate} from '@/entry/router';
import useDialog from '@/components/dialogs/useDialog';
import usePanel from '@/components/panels/usePanel';
import axios from 'axios';

export default function BackupSetting() {
    const navigate = useNavigate();
    const {showPanel} = usePanel();
    const {showDialog} = useDialog();

    const onBackupToLocal = async () => {
        navigate(ROUTE_PATH.FILE_SELECTOR, {
            fileType: 'folder',
            multi: false,
            actionText: '开始备份',
            async onAction(selectedFiles) {
                const raw = Backup.backup();
                const folder = selectedFiles[0]?.path;
                return new Promise(resolve => {
                    showDialog('LoadingDialog', {
                        title: '备份本地音乐',
                        promise: writeFile(
                            `${folder}${
                                folder?.endsWith('/') ? '' : '/'
                            }backup.json`,
                            raw,
                        ),
                        onResolve(_, hideDialog) {
                            Toast.success('备份成功~');
                            hideDialog();
                            resolve(true);
                        },
                        onCancel(hideDialog) {
                            hideDialog();
                            resolve(false);
                        },
                        onReject(reason, hideDialog) {
                            hideDialog();
                            resolve(false);
                            Toast.success(
                                `备份失败 ${reason?.message ?? reason}`,
                            );
                        },
                    });
                });
            },
        });
    };

    async function onResumeFromLocal() {
        try {
            let filePath: string | undefined;
            try {
                filePath = (await DocumentPicker.pickSingle()).uri;
            } catch {
                return;
            }
            const raw = await readFile(filePath);
            await Backup.resume(raw);
            Toast.success('恢复成功~');
        } catch (e: any) {
            Toast.warn(`恢复失败 ${e?.message ?? e}`);
        }
    }

    async function onResumeFromUrl() {
        showPanel('SimpleInput', {
            placeholder: '输入以json或txt结尾的URL',
            maxLength: 1024,
            async onOk(text, closePanel) {
                try {
                    const url = text.trim();
                    if (url.endsWith('.json') || url.endsWith('.txt')) {
                        const raw = (await axios.get(text)).data;
                        await Backup.resume(raw);
                        Toast.success('恢复成功~');
                        closePanel();
                    } else {
                        throw '无效的URL';
                    }
                } catch (e: any) {
                    Toast.warn(`备份失败 ${e?.message ?? e}`);
                }
            },
        });
    }

    return (
        <View style={style.wrapper}>
            <ListItem title={'备份到本地'} onPress={onBackupToLocal} />
            <ListItem title={'从本地文件恢复'} onPress={onResumeFromLocal} />
            <ListItem title={'从URL恢复'} onPress={onResumeFromUrl} />
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
});
