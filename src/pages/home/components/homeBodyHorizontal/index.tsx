import React from 'react';
import globalStyle from '@/constants/globalStyle';
import Operations from './operations';
import {View} from 'react-native';
import Sheets from '../homeBody/sheets';

export default function HomeBodyHorizontal() {
    return (
        <View style={globalStyle.rowfwflex1}>
            <Operations />
            <View style={globalStyle.fwflex1}>
                <Sheets />
            </View>
        </View>
    );
}
