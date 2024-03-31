import React, {useEffect} from 'react';
import {
    BackHandler,
    Image,
    StyleSheet,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import rpx, {vh, vw} from '@/utils/rpx';
import {GlobalState} from '@/utils/stateMapper';
import useOrientation from '@/hooks/useOrientation';
import {galleryBasePath, saveToGallery} from '@/utils/fileUtils';
import Toast from '@/utils/toast';
import {errorLog} from '@/utils/log';
import ThemeText from '../base/themeText';

const currentImgSrcState = new GlobalState<string | null>(null);

export function ImageViewComponent() {
    const currentImgSrc = currentImgSrcState.useValue();

    const orientation = useOrientation();

    useEffect(() => {
        const backHandler = BackHandler.addEventListener(
            'hardwareBackPress',
            () => {
                if (currentImgSrcState.getValue()) {
                    currentImgSrcState.setValue(null);
                    return true;
                }
                return false;
            },
        );
        return () => {
            backHandler.remove();
        };
    }, []);

    return currentImgSrc ? (
        <TouchableWithoutFeedback
            onPress={() => {
                currentImgSrcState.setValue(null);
            }}>
            <View style={style.wrapper}>
                <Image
                    style={
                        orientation === 'vertical'
                            ? {
                                  width: vw(100),
                                  minHeight: vw(100),
                                  maxHeight: vh(100),
                                  resizeMode: 'contain',
                              }
                            : {
                                  maxWidth: vw(80),
                                  height: vh(60),
                                  minWidth: vh(60),
                                  resizeMode: 'contain',
                              }
                    }
                    source={{
                        uri: currentImgSrc,
                    }}
                />

                <TouchableOpacity
                    onPress={e => {
                        e.stopPropagation();
                        const src = currentImgSrcState.getValue();
                        if (src) {
                            saveToGallery(src)
                                .then(() => {
                                    Toast.success(
                                        `图片已保存到 ${galleryBasePath}`,
                                    );
                                })
                                .catch(e => {
                                    errorLog('保存失败', e?.message ?? e);
                                    Toast.warn(`保存失败: ${e?.message ?? e}`);
                                });
                        }
                    }}>
                    <View style={style.button}>
                        <ThemeText color="white" fontSize="title">
                            点击保存
                        </ThemeText>
                    </View>
                </TouchableOpacity>
            </View>
        </TouchableWithoutFeedback>
    ) : null;
}

export default {
    show(url: string) {
        if (url) {
            currentImgSrcState.setValue(url);
        }
    },
    hide() {
        currentImgSrcState.setValue(null);
    },
};

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.8)',
    },
    button: {
        marginTop: rpx(48),
        paddingHorizontal: rpx(18),
        paddingVertical: rpx(16),
        borderRadius: rpx(12),
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: 'rgba(255,255,255,0.1)',
    },
});
