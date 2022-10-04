import React, {useRef, useState} from 'react';
import {Button, Dialog, ProgressBar} from 'react-native-paper';
import useColors from '@/hooks/useColors';
import ThemeText from '@/components/base/themeText';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {downloadFile, stopDownload} from 'react-native-fs';
import {sizeFormatter} from '@/utils/fileUtils';

interface IDownloadDialogProps {
    visible: boolean;
    hideDialog: () => void;
    title: string;
    content: string[];
    fromUrl: string;
    toFile: string;
    afterDownload?: (downloadPath: string) => void;
    afterCancel?: () => void;
}
export default function DownloadDialog(props: IDownloadDialogProps) {
    const {
        visible,
        title,
        content,
        afterDownload,
        afterCancel,
        fromUrl,
        toFile,
        hideDialog,
    } = props;
    const [progress, setProgress] = useState(0);
    const [totalSize, setTotalSize] = useState(0);
    const jobId = useRef<number>();
    const colors = useColors();

    return (
        <Dialog
            visible={visible}
            onDismiss={hideDialog}
            style={{backgroundColor: colors.primary}}>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Content>
                {content?.map?.(_ => (
                    <ThemeText key={_} style={style.item}>
                        {_}
                    </ThemeText>
                ))}
                {progress && totalSize && totalSize !== 0 ? (
                    <View style={style.progress}>
                        <ProgressBar
                            color={colors.textHighlight}
                            progress={progress / totalSize}
                        />
                        <ThemeText fontColor="highlight" fontSize="subTitle">
                            {sizeFormatter(progress)}/{sizeFormatter(totalSize)}
                        </ThemeText>
                    </View>
                ) : (
                    <></>
                )}
            </Dialog.Content>
            <Dialog.Actions>
                <Button
                    color={colors.text}
                    onPress={() => {
                        if (jobId.current) {
                            stopDownload(jobId.current);
                            jobId.current = undefined;
                            afterCancel?.();
                        }
                        hideDialog();
                    }}>
                    取消
                </Button>
                <Button
                    color={colors.text}
                    onPress={async () => {
                        if (jobId.current === undefined) {
                            const res = downloadFile({
                                fromUrl,
                                toFile,
                                background: true,
                                begin(res) {
                                    setTotalSize(res.contentLength);
                                },
                                progress(res) {
                                    setProgress(res.bytesWritten);
                                },
                            });
                            jobId.current = res.jobId;
                            await res.promise;
                            afterDownload?.(toFile);
                            hideDialog();
                        }
                    }}>
                    下载
                </Button>
            </Dialog.Actions>
        </Dialog>
    );
}

const style = StyleSheet.create({
    item: {
        marginBottom: rpx(12),
    },
    progress: {
        marginTop: rpx(12),
    },
});
