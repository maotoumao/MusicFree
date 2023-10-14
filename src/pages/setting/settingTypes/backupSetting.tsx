import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import DocumentPicker from 'react-native-document-picker';
import ListItem, {ListItemHeader} from '@/components/base/listItem';
import Toast from '@/utils/toast';
import Backup from '@/core/backup';
import {readFile, writeFile} from 'react-native-fs';
import {ROUTE_PATH, useNavigate} from '@/entry/router';

import axios from 'axios';
import {showDialog} from '@/components/dialogs/useDialog';
import {showPanel} from '@/components/panels/usePanel';

export default function BackupSetting() {
    const navigate = useNavigate();

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

    // const [webDavState, setWebDavState] = useState('');
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
            <ListItemHeader>本地备份</ListItemHeader>
            <ListItem withHorizonalPadding onPress={onBackupToLocal}>
                <ListItem.Content title="备份到本地" />
            </ListItem>
            <ListItem withHorizonalPadding onPress={onResumeFromLocal}>
                <ListItem.Content title="从本地文件恢复" />
            </ListItem>
            <ListItem withHorizonalPadding onPress={onResumeFromUrl}>
                <ListItem.Content title="从远程URL中恢复" />
            </ListItem>
            {/* <ListItemHeader>Webdav</ListItemHeader>
            <ListItem withHorizonalPadding onPress={console.log}>
                <ListItem.Content title="Webdav设置" />
            </ListItem>
            <ListItem withHorizonalPadding onPress={console.log}>
                <ListItem.Content title="同步到云存储" />
            </ListItem>
            <ListItem withHorizonalPadding onPress={onResumeFromUrl}>
                <ListItem.Content title="从云存储中恢复" />
            </ListItem> */}
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
});
