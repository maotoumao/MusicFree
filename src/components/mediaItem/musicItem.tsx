import React from 'react';
import {Text} from 'react-native';
import rpx from '@/utils/rpx';
import ListItem, {ILeftProps} from '../base/listItem';
import Download from '@/core/download';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import MusicQueue from '@/core/musicQueue';
import IconButton from '../base/iconButton';
import usePanel from '../panels/usePanel';

interface IMusicItemProps {
    index?: string | number;
    left?: ILeftProps;
    musicItem: IMusic.IMusicItem;
    musicSheet?: IMusic.IMusicSheetItem;
    onItemPress?: (musicItem: IMusic.IMusicItem) => void;
}
const ITEM_HEIGHT = rpx(120);
export default function MusicItem(props: IMusicItemProps) {
    const {musicItem, index, left, onItemPress, musicSheet} = props;
    const {showPanel} = usePanel();

    return (
        <ListItem
            itemHeight={ITEM_HEIGHT}
            left={index !== undefined ? {index: index, width: rpx(56)} : left}
            title={musicItem.title}
            desc={
                <>
                    {Download.isDownloaded(musicItem) && (
                        <Icon
                            color="#11659a"
                            name="check-circle"
                            size={rpx(22)}
                        />
                    )}
                    <Text>
                        {musicItem.artist} - {musicItem.album}
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
            right={() => (
                <IconButton
                    name="dots-vertical"
                    size="normal"
                    fontColor="normal"
                    onPress={() => {
                        showPanel('MusicItemOptions', {musicItem, musicSheet});
                    }}
                />
            )}
        />
    );
}
