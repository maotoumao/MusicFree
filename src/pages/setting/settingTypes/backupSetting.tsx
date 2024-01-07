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

import {AuthType, createClient} from 'webdav';
import Config from '@/core/config';

export default function BackupSetting() {
    const navigate = useNavigate();
    const webdavConfig = Config.useConfig('setting.webdav');
    const backupConfig = Config.useConfig('setting.backup');

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
            title: '恢复数据',
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
                    Toast.warn(`恢复失败 ${e?.message ?? e}`);
                }
            },
        });
    }

    async function onResumeFromWebdav() {
        const {username, password, url} = Config.get('setting.webdav') ?? {};
        if (!(username && password && url)) {
            Toast.warn('请先在「Webdav设置」中完成配置，再执行恢复');
            return;
        }
        const client = createClient(url, {
            authType: AuthType.Password,
            username: username,
            password: password,
        });

        if (!(await client.exists('/MusicFree/MusicFreeBackup.json'))) {
            Toast.warn('备份文件不存在');
            return;
        }

        try {
            const resumeData = await client.getFileContents(
                '/MusicFree/MusicFreeBackup.json',
                {
                    format: 'text',
                },
            );
            await Backup.resume(
                resumeData,
                Config.get('setting.backup.resumeMode') === 'overwrite',
            );
            Toast.success('恢复成功~');
        } catch (e: any) {
            Toast.warn(`恢复失败: ${e?.message ?? e}`);
        }
    }

    async function onBackupToWebdav() {
        const {username, password, url} = Config.get('setting.webdav') ?? {};
        if (!(username && password && url)) {
            Toast.warn('请先在「Webdav设置」中完成配置，再执行恢复');
            return;
        }
        try {
            const client = createClient(url, {
                authType: AuthType.Password,
                username: username,
                password: password,
            });

            const raw = Backup.backup();
            if (!(await client.exists('/MusicFree'))) {
                await client.createDirectory('/MusicFree');
            }
            // 临时文件
            await client.putFileContents(
                `/MusicFree/MusicFreeBackup.json`,
                raw,
                {
                    overwrite: true,
                },
            );
            Toast.success('备份成功');
        } catch (e: any) {
            Toast.warn(`备份失败: ${e?.message ?? e}`);
        }
    }

    return (
        <View style={style.wrapper}>
            <ListItemHeader>备份&恢复设置</ListItemHeader>

            <ListItem
                withHorizonalPadding
                onPress={() => {
                    showDialog('RadioDialog', {
                        title: '设置恢复方式',
                        content: [
                            {
                                key: '追加到歌单末尾',
                                value: 'append',
                            },
                            {
                                key: '覆盖歌单',
                                value: 'overwrite',
                            },
                        ],
                        onOk(value) {
                            Config.set(
                                'setting.backup.resumeMode',
                                value as any,
                            );
                        },
                    });
                }}>
                <ListItem.Content title="恢复方式" />
                <ListItem.ListItemText>
                    {backupConfig?.resumeMode === 'overwrite'
                        ? '覆盖歌单'
                        : '追加到歌单末尾'}
                </ListItem.ListItemText>
            </ListItem>
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
            <ListItemHeader>Webdav</ListItemHeader>
            <ListItem
                withHorizonalPadding
                onPress={() => {
                    showPanel('SetUserVariables', {
                        initValues: {
                            url: webdavConfig?.url ?? '',
                            username: webdavConfig?.username ?? '',
                            password: webdavConfig?.password ?? '',
                        },
                        variables: [
                            {
                                key: 'url',
                                name: 'URL',
                                hint: 'webdav服务地址',
                            },
                            {
                                key: 'username',
                                name: '用户名',
                            },
                            {
                                key: 'password',
                                name: '密码',
                            },
                        ],
                        onOk(values, closePanel) {
                            Config.set('setting.webdav', values);
                            Toast.success('保存成功');
                            closePanel();
                        },
                    });
                }}>
                <ListItem.Content title="Webdav设置" />
            </ListItem>
            <ListItem withHorizonalPadding onPress={onBackupToWebdav}>
                <ListItem.Content title="备份到Webdav" />
            </ListItem>
            <ListItem withHorizonalPadding onPress={onResumeFromWebdav}>
                <ListItem.Content title="从Webdav中恢复" />
            </ListItem>
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
});
