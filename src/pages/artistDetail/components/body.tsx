import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import {FlatList} from 'react-native-gesture-handler';

interface IBodyProps {}
export default function Body(props: IBodyProps) {
  return (
    <View style={style.wrapper}>
      <FlatList
        data={[1, 2, 3]}
        renderItem={({item}) => (
          <FlatList
            data={[item + 1]}
            renderItem={() => <Text>dsd</Text>}></FlatList>
        )}></FlatList>
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    height: 900,
    flexShrink: 0,
    backgroundColor: 'blue',
  },
});
