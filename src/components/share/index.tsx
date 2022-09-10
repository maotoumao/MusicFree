import React, {useEffect, useRef, useState} from 'react';
import {Image, Pressable, StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {useAtomValue} from 'jotai';
import useShare, {shareInfoAtom, showShareAtom} from './useShare';
import {Button} from 'react-native-paper';
import QRCode from 'qrcode-generator';
import ThemeText from '../base/themeText';
import ViewShot from 'react-native-view-shot';
import {saveToGallery} from '@/utils/fileUtils';

function Share() {
    const shareInfo = useAtomValue(shareInfoAtom);
    const {closeShare} = useShare();
    const [qrCode, setQrCode] = useState<string>();
    const viewRef = useRef<ViewShot | null>();
    useEffect(() => {
        if (shareInfo.content) {
            let content: string;
            try {
                content = JSON.stringify(shareInfo.content);
            } catch {
                content = '{}';
            }
            const qr = QRCode(16, 'L');
            qr.addData(content);
            qr.make();
            setQrCode(qr.createDataURL());
        }
    }, [shareInfo]);

    return (
        <Pressable
            style={style.wrapper}
            onPress={() => {
                closeShare();
            }}>
            <ViewShot style={style.container} ref={_ => (viewRef.current = _)}>
                <Image
                    style={style.image}
                    source={{
                        uri: qrCode,
                    }}
                />
                <ThemeText>
                    {shareInfo.title ?? ''} - {shareInfo.desc ?? ''}
                </ThemeText>
            </ViewShot>
            <Button
                style={{backgroundColor: 'white'}}
                onPress={async () => {
                    const result = await viewRef.current?.capture?.();
                    if (result) {
                        saveToGallery(result);
                    }
                }}>
                保存
            </Button>
        </Pressable>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        position: 'absolute',
        alignItems: 'center',
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        backgroundColor: '#66666666',
    },
    container: {
        width: rpx(600),
        height: rpx(600),
        marginTop: rpx(200),
        flex: 0,
        alignItems: 'center',
    },
    image: {
        marginTop: rpx(100),
        width: rpx(400),
        height: rpx(400),
    },
});

export default () => {
    const showShare = useAtomValue(showShareAtom);
    return showShare ? <Share /> : <></>;
};
