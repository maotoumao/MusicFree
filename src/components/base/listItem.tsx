import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';

interface IListItemProps {}
export default function ListItem(props: IListItemProps) {
    console.log(props);
    return <View style={styles.wrapper} />;
}

const styles = StyleSheet.create({
    wrapper: {
        width: rpx(750),
    },
});
