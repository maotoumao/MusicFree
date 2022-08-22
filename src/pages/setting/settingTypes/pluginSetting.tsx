import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import {pluginManager} from '@/common/pluginManager';
import {Button, List, useTheme} from 'react-native-paper';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import Loading from '@/components/loading';
import {fontSizeConst, fontWeightConst} from '@/constants/uiConst';
import ThemeText from '@/components/themeText';

interface IPluginSettingProps {}
export default function PluginSetting(props: IPluginSettingProps) {
  const [plugins, setPlugins] = useState(pluginManager.getPlugins());
  const [loading, setLoading] = useState(false);
  const {colors} = useTheme();

  useEffect(() => {});
  return (
    <View style={style.wrapper}>
      <ThemeText style={style.header}>插件列表</ThemeText>
      {loading ? (
        <Loading></Loading>
      ) : (
        <>
          {plugins.map(plugin => (
            <List.Item
              key={plugin.hash}
              titleStyle={[
                {
                  color: plugin.state === 'error' ? 'red' : colors.text,
                },
              ]}
              title={plugin.instance.platform ?? '(未命名插件)'}></List.Item>
          ))}
        </>
      )}
      <Button
        color={colors.text}
        onPress={async () => {
          try {
            const result = await DocumentPicker.pickMultiple();
            setLoading(true);
            await Promise.all(
              result.map(_ => {
                const name =
                  _.name ?? _.uri.substring(_.uri.lastIndexOf('/') + 1);
                return name.endsWith('.js')
                  ? RNFS.copyFile(_.uri, pluginManager.pluginPath + name)
                  : Promise.resolve();
              }),
            );
            await pluginManager.initPlugins();
            setPlugins(pluginManager.getPlugins());
          } catch (e) {
            console.log(e, '寄了');
          }
          setLoading(false);
        }}>
        新增插件
      </Button>
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    padding: rpx(24),
  },
  header: {
    fontSize: fontSizeConst.big,
    fontWeight: fontWeightConst.bold,
    marginBottom: rpx(24),
  },
});
