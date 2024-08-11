import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {fontSizeConst} from '@/constants/uiConst';
import useColors from '@/hooks/useColors';
import PanelFullscreen from '@/components/panels/base/panelFullscreen.tsx';
import AppBar from '@/components/base/appBar.tsx';
import {hidePanel} from '@/components/panels/usePanel.ts';
import globalStyle from '@/constants/globalStyle.ts';
import VerticalSafeAreaView from '@/components/base/verticalSafeAreaView.tsx';
import MusicSheet from '@/core/musicSheet';
import Toast from '@/utils/toast.ts';
import ThemeText from '@/components/base/themeText.tsx';
import Input from '@/components/base/input.tsx';
import {Button} from '@/components/base/button.tsx';

interface IEditMusicSheetInfoProps {
    musicSheet: IMusic.IMusicSheetItemBase;
}

export default function EditMusicSheetInfo(props: IEditMusicSheetInfoProps) {
    const {musicSheet} = props;

    const colors = useColors();

    // const [coverImg, setCoverImg] = useState(musicSheet?.coverImg);
    const [title, setTitle] = useState(musicSheet?.title);

    // const onChangeCoverPress = async () => {
    //     try {
    //         const result = await launchImageLibrary({
    //             mediaType: 'photo',
    //         });
    //         const uri = result.assets?.[0].uri;
    //         if (!uri) {
    //             return;
    //         }
    //         console.log(uri);
    //         setCoverImg(uri);
    //     } catch (e) {
    //         console.log(e);
    //     }
    // };

    function onTitleChange(_: string) {
        setTitle(_);
    }

    async function onConfirm() {
        // 判断是否相同
        if (
            // coverImg === musicSheet?.coverImg &&
            title === musicSheet?.title
        ) {
            hidePanel();
            return;
        }

        // let newCoverImg = coverImg;
        // if (coverImg && coverImg !== musicSheet?.coverImg) {
        //     newCoverImg = addFileScheme(
        //         `${pathConst.dataPath}sheet${musicSheet.id}${coverImg.substring(
        //             coverImg.lastIndexOf('.'),
        //         )}`,
        //     );
        //     try {
        //         if ((await getInfoAsync(newCoverImg)).exists) {
        //             await deleteAsync(newCoverImg, {
        //                 idempotent: true, // 报错时不抛异常
        //             });
        //         }
        //         await copyAsync({
        //             from: coverImg,
        //             to: newCoverImg,
        //         });
        //     } catch (e) {
        //         console.log(e);
        //     }
        // }
        let _title = title;
        if (!_title?.length) {
            _title = musicSheet.title;
        }
        // 更新歌单信息
        MusicSheet.updateMusicSheetBase(musicSheet.id, {
            // coverImg: newCoverImg ? addRandomHash(newCoverImg) : undefined,
            title: _title,
        }).then(() => {
            Toast.success('更新歌单信息成功~');
        });
        hidePanel();
    }
    return (
        <PanelFullscreen>
            <VerticalSafeAreaView style={globalStyle.fwflex1}>
                <AppBar
                    withStatusBar
                    children="编辑歌单信息"
                    onBackPress={hidePanel}
                />
                {/*<View style={style.row}>*/}
                {/*    <ThemeText>封面</ThemeText>*/}
                {/*    <TouchableOpacity*/}
                {/*        onPress={onChangeCoverPress}*/}
                {/*        onLongPress={() => {*/}
                {/*            setCoverImg(undefined);*/}
                {/*        }}>*/}
                {/*        <Image*/}
                {/*            style={style.coverImg}*/}
                {/*            uri={coverImg}*/}
                {/*            emptySrc={ImgAsset.albumDefault}*/}
                {/*        />*/}
                {/*    </TouchableOpacity>*/}
                {/*</View>*/}
                <View style={style.row}>
                    <ThemeText>歌单名</ThemeText>
                    <Input
                        numberOfLines={1}
                        textAlign="right"
                        value={title}
                        hasHorizonalPadding={false}
                        onChangeText={onTitleChange}
                        style={{
                            height: fontSizeConst.content * 2.5,
                            width: '50%',
                            borderBottomWidth: 1,
                            includeFontPadding: false,
                            borderBottomColor: colors.text,
                        }}
                    />
                </View>
                <Button
                    style={style.button}
                    text={'提交'}
                    onPress={onConfirm}
                />
            </VerticalSafeAreaView>
        </PanelFullscreen>
    );
}

const style = StyleSheet.create({
    row: {
        marginTop: rpx(28),
        height: rpx(120),
        paddingHorizontal: rpx(24),
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    coverImg: {
        width: rpx(100),
        height: rpx(100),
        borderRadius: rpx(28),
    },
    button: {
        marginTop: rpx(24),
    },
});
