import React from 'react';
import {StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import rpx from '@/utils/rpx';
import ListItem from '../base/listItem';

import LocalMusicSheet from '@/core/localMusicSheet';
import {showPanel} from '../panels/usePanel';
import TitleAndTag from './titleAndTag';
import ThemeText from '../base/themeText';
import TrackPlayer from '@/core/trackPlayer';
import Icon from '@/components/base/icon.tsx';

interface IMusicItemProps {
    index?: string | number;
    showMoreIcon?: boolean;
    musicItem: IMusic.IMusicItem;
    musicSheet?: IMusic.IMusicSheetItem;
    onItemPress?: (musicItem: IMusic.IMusicItem) => void;
    onItemLongPress?: () => void;
    itemPaddingRight?: number;
    left?: () => JSX.Element;
    containerStyle?: StyleProp<ViewStyle>;
}
export default function MusicItem(props: IMusicItemProps) {
    const {
        musicItem,
        index,
        onItemPress,
        onItemLongPress,
        musicSheet,
        itemPaddingRight,
        showMoreIcon = true,
        left: Left,
        containerStyle,
    } = props;

    return (
        <ListItem
            heightType="big"
            style={containerStyle}
            withHorizontalPadding
            leftPadding={index !== undefined ? 0 : undefined}
            rightPadding={itemPaddingRight}
            onLongPress={onItemLongPress}
            onPress={() => {
                if (onItemPress) {
                    onItemPress(musicItem);
                } else {
                    TrackPlayer.play(musicItem);
                }
            }}>
            {Left ? <Left /> : null}
            {index !== undefined ? (
                <ListItem.ListItemText
                    width={rpx(82)}
                    position="none"
                    fixedWidth
                    contentStyle={styles.indexText}>
                    {index}
                </ListItem.ListItemText>
            ) : null}
            <ListItem.Content
                title={
                    <TitleAndTag
                        title={musicItem.title}
                        tag={musicItem.platform}
                    />
                }
                description={
                    <View style={styles.descContainer}>
                        {LocalMusicSheet.isLocalMusic(musicItem) && (
                            <Icon
                                style={styles.icon}
                                color="#11659a"
                                name="check-circle"
                                size={rpx(22)}
                            />
                        )}
                        <ThemeText
                            numberOfLines={1}
                            fontSize="description"
                            fontColor="textSecondary">
                            {musicItem.artist}
                            {musicItem.album ? ` - ${musicItem.album}` : ''}
                        </ThemeText>
                    </View>
                }
            />
            {showMoreIcon ? (
                <ListItem.ListItemIcon
                    width={rpx(48)}
                    position="none"
                    icon="ellipsis-vertical"
                    onPress={() => {
                        showPanel('MusicItemOptions', {
                            musicItem,
                            musicSheet,
                        });
                    }}
                />
            ) : null}
        </ListItem>
    );
}

const styles = StyleSheet.create({
    icon: {
        marginRight: rpx(6),
    },
    descContainer: {
        flexDirection: 'row',
        marginTop: rpx(16),
    },

    indexText: {
        fontStyle: 'italic',
        textAlign: 'center',
    },
});
