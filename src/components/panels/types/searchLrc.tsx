import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx, {vmax} from '@/utils/rpx';

import {fontSizeConst} from '@/constants/uiConst';
import Color from 'color';
import Button from '@/components/base/button';
import useColors from '@/hooks/useColors';
import PanelBase from '../base/panelBase';
import {TextInput} from 'react-native-gesture-handler';

interface INewMusicSheetProps {
    musicItem: IMusic.IMusicItem;
}

export default function SearchLrc(props: INewMusicSheetProps) {
    const {musicItem} = props;
    console.log(musicItem);

    const [input, setInput] = useState('');
    const colors = useColors();

    return (
        <PanelBase
            keyboardAvoidBehavior="height"
            height={vmax(80)}
            renderBody={() => (
                <View style={style.wrapper}>
                    <View style={style.titleContainer}>
                        <TextInput
                            value={input}
                            onChangeText={_ => {
                                setInput(_);
                            }}
                            style={[
                                style.input,
                                {
                                    color: colors.text,
                                    backgroundColor: Color(colors.primary)
                                        .lighten(0.7)
                                        .toString(),
                                },
                            ]}
                            placeholderTextColor={colors.textSecondary}
                            placeholder={'歌曲名称'}
                            maxLength={80}
                        />
                        <Button>搜索</Button>
                    </View>
                </View>
            )}
        />
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        paddingHorizontal: rpx(24),
        paddingTop: rpx(36),
    },
    titleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    opeartions: {
        width: rpx(750),
        paddingHorizontal: rpx(24),
        flexDirection: 'row',
        height: rpx(100),
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    input: {
        borderRadius: rpx(12),
        fontSize: fontSizeConst.content,
        lineHeight: fontSizeConst.content * 1.5,
        padding: rpx(12),
        flex: 1,
    },
});
