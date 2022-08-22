import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import ListItem from '@/components/listItem';
import { setConfig, useConfig } from '@/common/localConfigManager';
import DocumentPicker from 'react-native-document-picker';
import { Button } from 'react-native-paper';

interface IBasicSettingProps {}
export default function BasicSetting(props: IBasicSettingProps) {
  const config = useConfig();
  return <View style={style.wrapper}>
    <ListItem icon='image-frame' title={config?.setting?.background ?? '默认'} onPress={async () => {
      try {
        const result = await DocumentPicker.pickSingle({
          type: DocumentPicker.types.images
        });
        setConfig('setting.background', result.uri);
      } catch{}
    }}></ListItem>
    <Button onPress={() => {
      setConfig('setting.background', undefined);
    }}>还原</Button>
  </View>;
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    padding: rpx(24),
  },
});
