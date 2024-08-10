import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import AppBar from '@/components/base/appBar';
import VerticalSafeAreaView from '@/components/base/verticalSafeAreaView';
import globalStyle from '@/constants/globalStyle';
import Button from '@/components/base/textButton.tsx';
import Body from './body';
import {useNavigation} from '@react-navigation/native';

export default function SetCustomTheme() {
    const navigation = useNavigation();
    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <AppBar
                withStatusBar
                actionComponent={
                    <Button
                        style={styles.submit}
                        onPress={() => {
                            navigation.goBack();
                        }}
                        fontColor="appBarText">
                        完成
                    </Button>
                }>
                自定义背景
            </AppBar>
            <Body />
        </VerticalSafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        width: rpx(750),
    },
    submit: {
        justifyContent: 'center',
    },
});
