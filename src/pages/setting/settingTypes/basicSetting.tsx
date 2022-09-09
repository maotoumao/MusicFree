import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {setConfig, useConfig} from '@/core/localConfigManager';
import Download from '@/core/download';
import { Text} from 'react-native-paper';
import ListItem from '@/components/base/listItem';
import {FlatList} from 'react-native-gesture-handler';
import ThemeText from '@/components/base/themeText';
import useDialog from '@/components/dialogs/useDialog';
import ThemeSwitch from '@/components/base/swtich';

interface IBasicSettingProps {}
const ITEM_HEIGHT = rpx(96);
export default function BasicSetting(props: IBasicSettingProps) {
  const d = [
    '允许移动网络播放',
    '允许移动网络下载',
    '允许与其他应用同时播放',
    '播放中自动跳过加载失败的歌曲',
    '最大同时下载数目 1 / 3 / 5',
    '清空缓存(图片缓存+其他缓存)',
    '缓存容量上限(100MB, 200MB, 1GB, 2GB)',
  ];

  const basicSetting = useConfig('setting.basic');
  const {showDialog} = useDialog();
  const options = [
    {
      title: '允许与其他应用同时播放',
      right: () => (
        <ThemeSwitch value={basicSetting?.notInterrupt ?? false}></ThemeSwitch>
      ),
      onPress() {
        setConfig('setting.basic.notInterrupt', !basicSetting?.notInterrupt);
      },
    },{
      title: '播放失败时自动播放列表中的下一首',
      right: () => (
        <ThemeSwitch value={basicSetting?.autoStopWhenError ?? false}></ThemeSwitch>
      ),
      onPress() {
        setConfig('setting.basic.autoStopWhenError', !basicSetting?.autoStopWhenError);
      },
    },
    {
      title: '最大同时下载数目',
      right: () => (
        <ThemeText style={style.centerText}>
          {basicSetting?.maxDownload ?? 3}
        </ThemeText>
      ),
      onPress() {
        showDialog('RadioDialog', {
          title: '最大同时下载数目',
          content: [1, 3, 5, 7],
          onOk(val) {
            setConfig('setting.basic.maxDownload', val);
          },
        });
      },
    },
    {
      title: '记录错误日志',
      right: () => (
        <ThemeSwitch value={basicSetting?.debug?.errorLog ?? false}></ThemeSwitch>
      ),
      onPress() {
        setConfig(
          'setting.basic.debug.errorLog',
          !basicSetting?.debug?.errorLog,
        );
      },
    },
    {
      title: '记录详细日志',
      right: () => (
        <ThemeSwitch value={basicSetting?.debug?.traceLog ?? false}></ThemeSwitch>
      ),
      onPress() {
        setConfig(
          'setting.basic.debug.traceLog',
          !basicSetting?.debug?.traceLog,
        );
      },
    },
  ];
  return (
    <View style={style.wrapper}>
      <FlatList
        data={options}
        renderItem={({item}) => (
          <ListItem
            itemHeight={ITEM_HEIGHT}
            title={item.title}
            right={item.right}
            onPress={item.onPress}></ListItem>
        )}></FlatList>
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    paddingVertical: rpx(24),
  },
  centerText: {
    textAlignVertical: 'center',
  },
});
