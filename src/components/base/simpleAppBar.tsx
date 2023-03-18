import React from 'react';
import {StyleSheet} from 'react-native';
import {useNavigation, useTheme} from '@react-navigation/native';
import {Appbar} from 'react-native-paper';
import ThemeText from '@/components/base/themeText';
import rpx from '@/utils/rpx';
import HorizonalSafeAreaView from './horizonalSafeAreaView';

interface ISimpleAppBarProps {
    title?: string;
}
export default function SimpleAppBar(props: ISimpleAppBarProps) {
    const navigation = useNavigation();
    const {title} = props;
    const {colors} = useTheme();

    return (
        <Appbar style={[style.appbar, {backgroundColor: colors.primary}]}>
            <HorizonalSafeAreaView style={style.safeArea}>
                <>
                    <Appbar.BackAction
                        color={colors.text}
                        onPress={() => {
                            navigation.goBack();
                        }}
                    />
                    <Appbar.Header style={style.header}>
                        <ThemeText
                            style={style.header}
                            fontSize="title"
                            fontWeight="semibold">
                            {title ?? ''}
                        </ThemeText>
                    </Appbar.Header>
                </>
            </HorizonalSafeAreaView>
        </Appbar>
    );
}

const style = StyleSheet.create({
    appbar: {
        shadowColor: 'transparent',
        backgroundColor: '#2b333eaa',
        zIndex: 10000,
        height: rpx(88),
    },
    safeArea: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    header: {
        backgroundColor: 'transparent',
        shadowColor: 'transparent',
    },
});
