import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import {Divider} from 'react-native-paper';
import MusicSheet from '@/common/musicSheetManager';
import {_usePanel} from '../usePanelShow';
import {fontSizeConst} from '@/constants/uiConst';
import usePrimaryColor from '@/hooks/usePrimaryColor';
import useTextColor from '@/hooks/useTextColor';
import Color from 'color';
import Button from '@/components/button';
import useColors from '@/hooks/useColors';

interface INewMusicSheetProps {}
export default function NewMusicSheet(props: INewMusicSheetProps) {
  const {show, closePanel} = _usePanel();
  const [input, setInput] = useState('');
  const colors = useColors();

  return (
    <BottomSheet
      backgroundStyle={{backgroundColor: colors.primary}}
      backdropComponent={props => {
        return (
          <BottomSheetBackdrop
            disappearsOnIndex={-1}
            pressBehavior={'close'}
            opacity={0.5}
            {...props}></BottomSheetBackdrop>
        );
      }}
      handleComponent={null}
      index={show}
      snapPoints={['30%']}
      enablePanDownToClose
      enableOverDrag={false}
      onClose={closePanel}>
      <View style={style.opeartions}>
        <Button
          onPress={() => {
            closePanel();
          }}>
          取消
        </Button>
        <Button
          onPress={async () => {
            if (input) {
              MusicSheet.addSheet(input);
              closePanel();
            }
          }}>
          确认
        </Button>
      </View>
      <Divider></Divider>
      <BottomSheetTextInput
        value={input}
        onChangeText={_ => {
          setInput(_);
        }}
        style={[
          style.input,
          {
            backgroundColor: Color(colors.primary).lighten(0.7).toString()
          },
        ]}
        placeholder={'新建歌单'}
        maxLength={12}
      />
    </BottomSheet>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
  },
  opeartions: {
    width: rpx(750),
    paddingHorizontal: rpx(24),
    flexDirection: 'row',
    height: rpx(100),
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  input: {
    marginTop: rpx(12),
    marginBottom: rpx(12),
    borderRadius: rpx(12),
    fontSize: fontSizeConst.content,
    lineHeight: fontSizeConst.content * 1.5,
    padding: rpx(12),
  },
});
