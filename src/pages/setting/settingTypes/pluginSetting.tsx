import React, {useEffect, useState} from 'react';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import {pluginManager} from '@/common/pluginManager';
import {Button, List, useTheme} from 'react-native-paper';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import Loading from '@/components/base/loading';
import ThemeText from '@/components/base/themeText';
import ListItem from '@/components/base/listItem';
import IconButton from '@/components/base/iconButton';
import useDialog from '@/components/dialogs/useDialog';

interface IPluginSettingProps {}
export default function PluginSetting(props: IPluginSettingProps) {
  const [plugins, setPlugins] = useState(pluginManager.getPlugins());
  const [loading, setLoading] = useState(false);
  const {colors} = useTheme();
  const {showDialog} = useDialog();

  useEffect(() => {});
  return (
    <View style={style.wrapper}>
      <ThemeText fontSize="subTitle" style={style.header}>
        插件列表
      </ThemeText>
      {loading ? (
        <Loading></Loading>
      ) : (
        <>
          <FlatList
            data={plugins ?? []}
            keyExtractor={_ => _.hash}
            renderItem={({item: plugin}) => (
              <ListItem
                itemHeight={rpx(96)}
                title={plugin.instance.platform ?? '(未命名插件)'}
                right={() => (
                  <IconButton
                    name="trash-can-outline"
                    size="normal"
                    onPress={() => {
                      showDialog('SimpleDialog', {
                        title: '卸载插件',
                        content: `确认卸载插件${plugin.instance.platform}吗`,
                        async onOk() {
                          try {
                            setLoading(true);
                            await RNFS.unlink(plugin.instance._path);

                            await pluginManager.setupPlugins();
                            setPlugins(pluginManager.getPlugins());
                          } catch {}
                          setLoading(false);
                        },
                      });
                    }}></IconButton>
                )}></ListItem>
            )}></FlatList>
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
                  ? RNFS.copyFile(_.uri, pluginManager.pluginPath + `${Date.now()}${name}`)
                  : Promise.resolve();
              }),
            );
            await pluginManager.setupPlugins();
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
    paddingTop: rpx(36),
  },
  header: {
    marginBottom: rpx(24),
  },
});
