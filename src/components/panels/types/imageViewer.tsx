import React from 'react';
import {Image, StyleSheet} from 'react-native';
import rpx, {vh, vw} from '@/utils/rpx';
import Toast from '@/utils/toast';
import useOrientation from '@/hooks/useOrientation.ts';
import {galleryBasePath, saveToGallery} from '@/utils/fileUtils.ts';
import {errorLog} from '@/utils/log.ts';
import PanelFullscreen from '@/components/panels/base/panelFullscreen.tsx';
import {Button} from '@/components/base/button.tsx';

interface IImageViewerProps {
    // 图片路径
    url: string;
}

export default function ImageViewer(props: IImageViewerProps) {
    const {url} = props;
    const orientation = useOrientation();

    return (
        <PanelFullscreen
            hasMask
            animationType="Scale"
            containerStyle={styles.container}>
            <Image
                style={
                    orientation === 'vertical'
                        ? {
                              width: vw(100),
                              minHeight: vw(100),
                              maxHeight: vh(100),
                              resizeMode: 'cover',
                          }
                        : {
                              maxWidth: vw(80),
                              height: vh(60),
                              minWidth: vh(60),
                              resizeMode: 'cover',
                          }
                }
                source={{
                    uri: url,
                }}
            />
            <Button
                text={'保存图片'}
                type="primary"
                style={styles.button}
                onPress={() => {
                    saveToGallery(url)
                        .then(() => {
                            Toast.success(`图片已保存到 ${galleryBasePath}`);
                        })
                        .catch(e => {
                            errorLog('保存失败', e?.message ?? e);
                            Toast.warn(`保存失败: ${e?.message ?? e}`);
                        });
                }}
            />
        </PanelFullscreen>
    );
}

const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
        gap: rpx(48),
    },
    button: {
        marginHorizontal: rpx(24),
        paddingHorizontal: rpx(200),
    },
});
