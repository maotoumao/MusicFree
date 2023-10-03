import React from 'react';
import {StyleSheet} from 'react-native';
import settingTypes from './settingTypes';
import {SafeAreaView} from 'react-native-safe-area-context';
import StatusBar from '@/components/base/statusBar';
import {useParams} from '@/entry/router';
import HorizonalSafeAreaView from '@/components/base/horizonalSafeAreaView';
import AppBar from '@/components/base/appBar';

export default function Setting() {
    const {type} = useParams<'setting'>();
    const settingItem = settingTypes[type];

    return (
        <SafeAreaView edges={['bottom', 'top']} style={style.wrapper}>
            <StatusBar />
            {settingItem.showNav === false ? null : (
                <AppBar>{settingItem?.title}</AppBar>
            )}

            {type === 'plugin' ? (
                <settingItem.component />
            ) : (
                <HorizonalSafeAreaView style={style.wrapper}>
                    <settingItem.component />
                </HorizonalSafeAreaView>
            )}
        </SafeAreaView>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        flex: 1,
    },
    appbar: {
        shadowColor: 'transparent',
        backgroundColor: '#2b333eaa',
    },
    header: {
        backgroundColor: 'transparent',
        shadowColor: 'transparent',
    },
});
