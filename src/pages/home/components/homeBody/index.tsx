import React from 'react';
import globalStyle from '@/constants/globalStyle';
import {ScrollView} from 'react-native-gesture-handler';
import Operations from './operations';
import FavoriteMusicList from './favoriteMusic';
import Sheets from './sheets';

export default function HomeBody() {
    return (
        <ScrollView
            style={globalStyle.fwflex1}
            showsVerticalScrollIndicator={false}>
            <Operations />
            <FavoriteMusicList />
            <Sheets />
        </ScrollView>
    );
}
