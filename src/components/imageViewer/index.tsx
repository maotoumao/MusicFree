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
import {saveToGallery} from '@/utils/fileUtils';
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
                                  width: vw(80),
                                  minHeight: vw(80),
                                  maxHeight: vh(80),
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
                                    Toast.success('保存成功~');
                                })
                                .catch(e => {
                                    errorLog('保存失败', e?.message ?? e);
                                    Toast.warn(`保存失败: ${e?.message ?? e}`);
                                });
                        }
                    }}>
                    <View style={style.button}>
                        <ThemeText>点击保存</ThemeText>
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
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    button: {
        marginTop: rpx(36),
        paddingHorizontal: rpx(18),
        paddingVertical: rpx(12),
        borderRadius: rpx(8),
        backgroundColor: '#20232a ',
    },
});
