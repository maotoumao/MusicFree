import React from 'react';
import {Text} from 'react-native';
import rpx from '@/utils/rpx';
import ListItem, {ILeftProps} from '../base/listItem.old';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import MusicQueue from '@/core/musicQueue';
import IconButton from '../base/iconButton';

import LocalMusicSheet from '@/core/localMusicSheet';
import {showPanel} from '../panels/usePanel';

interface IMusicItemProps {
    index?: string | number;
    left?: ILeftProps;
    right?: () => JSX.Element;
    musicItem: IMusic.IMusicItem;
    musicSheet?: IMusic.IMusicSheetItem;
    onItemPress?: (musicItem: IMusic.IMusicItem) => void;
    onItemLongPress?: () => void;
    itemWidth?: number | string;
    itemBackgroundColor?: string;
    itemPaddingRight?: number;
}
const ITEM_HEIGHT = rpx(120);
export default function MusicItem(props: IMusicItemProps) {
    const {
        musicItem,
        index,
        left,
        right,
        onItemPress,
        onItemLongPress,
        musicSheet,
        itemWidth,
        itemPaddingRight,
        itemBackgroundColor,
    } = props;

    return (
        <ListItem
            itemWidth={itemWidth}
            itemHeight={ITEM_HEIGHT}
            itemPaddingLeft={index !== undefined ? 0 : undefined}
            itemPaddingRight={itemPaddingRight}
            itemBackgroundColor={itemBackgroundColor}
            onLongPress={onItemLongPress}
            left={index !== undefined ? {index: index, width: rpx(96)} : left}
            title={musicItem.title}
            desc={
                <>
                    {LocalMusicSheet.isLocalMusic(musicItem) && (
                        <Icon
                            color="#11659a"
                            name="check-circle"
                            size={rpx(22)}
                        />
                    )}
                    <Text>
                        {musicItem.artist}
                        {musicItem.album ? ` - ${musicItem.album}` : ''}
                    </Text>
                </>
            }
            tag={musicItem.platform}
            onPress={() => {
                if (onItemPress) {
                    onItemPress(musicItem);
                } else {
                    MusicQueue.play(musicItem);
                }
            }}
            right={
                right
                    ? right
                    : () => (
                          <IconButton
                              name={'dots-vertical'}
                              sizeType="normal"
                              fontColor="normal"
                              onPress={() => {
                                  showPanel('MusicItemOptions', {
                                      musicItem,
                                      musicSheet,
                                  });
                              }}
                          />
                      )
            }
        />
    );
}
