import React, {Fragment} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {Divider} from 'react-native-paper';
import ThemeText from '@/components/base/themeText';

import usePanel from '../usePanel';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import PanelBase from '../base/panelBase';
import {ScrollView} from 'react-native-gesture-handler';

interface IPlayRateProps {
    /** 点击回调 */
    onRatePress: (rate: number) => void;
}

const rates = [50, 75, 100, 125, 150, 175, 200];

export default function PlayRate(props: IPlayRateProps) {
    const {onRatePress} = props ?? {};

    const {hidePanel} = usePanel();
    const safeAreaInsets = useSafeAreaInsets();

    return (
        <PanelBase
            height={rpx(520)}
            renderBody={() => (
                <>
                    <View style={style.header}>
                        <ThemeText fontWeight="bold" fontSize="title">
                            播放速度
                        </ThemeText>
                    </View>
                    <ScrollView
                        style={[
                            style.body,
                            {marginBottom: safeAreaInsets.bottom},
                        ]}>
                        {rates.map(key => {
                            return (
                                <Fragment key={`frag-${key}`}>
                                    <Divider key={`di-${key}`} />
                                    <Pressable
                                        key={`btn-${key}`}
                                        style={style.item}
                                        onPress={() => {
                                            onRatePress(key);
                                            hidePanel();
                                        }}>
                                        <ThemeText>{key / 100}x</ThemeText>
                                    </Pressable>
                                </Fragment>
                            );
                        })}
                        <Divider />
                    </ScrollView>
                </>
            )}
        />
    );
}

const style = StyleSheet.create({
    header: {
        width: '100%',
        flexDirection: 'row',
        padding: rpx(24),
    },
    body: {
        flex: 1,
        paddingHorizontal: rpx(24),
    },
    item: {
        height: rpx(96),
        justifyContent: 'center',
    },
});
