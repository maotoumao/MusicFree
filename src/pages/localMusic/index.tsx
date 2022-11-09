import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {SafeAreaView} from 'react-native-safe-area-context';
import StatusBar from '@/components/base/statusBar';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import MainPage from './mainPage';
import ScanPage from './scanPage';

const Stack = createNativeStackNavigator();
export default function LocalMusic() {
    return (
        <SafeAreaView style={style.wrapper}>
            <StatusBar />
            <Stack.Navigator
                initialRouteName="local/index"
                screenOptions={{
                    headerShown: false,
                    animation: 'slide_from_right',
                    animationDuration: 200,
                }}>
                <Stack.Screen
                    key={'local-index'}
                    name={'local/index'}
                    component={MainPage}
                />
                <Stack.Screen
                    key={'local-scan'}
                    name={'local/scan'}
                    component={ScanPage}
                />
            </Stack.Navigator>
        </SafeAreaView>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
});
