import React from 'react';
import {FlatList, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import Download from '@/core/download';
import ListItem from '@/components/base/listItem';
import {sizeFormatter} from '@/utils/fileUtils';

export default function DownloadingList() {
    const downloading = Download.useDownloadingMusic();
    const pending = Download.usePendingMusic();
    const progress = Download.useDownloadingProgress(); // progress没有更新同步

    return (
        <View style={style.wrapper}>
            <FlatList
                style={style.downloading}
                data={downloading.concat(pending)}
                keyExtractor={_ => `dl${_.filename}`}
                extraData={progress}
                renderItem={({item, index}) => {
                    if (index < downloading.length) {
                        const prog = progress[item.filename];
                        return (
                            <ListItem withHorizontalPadding>
                                <ListItem.Content
                                    title={item.musicItem.title}
                                    description={`${
                                        prog?.progress
                                            ? sizeFormatter(prog.progress)
                                            : '-'
                                    } / ${
                                        prog?.size
                                            ? sizeFormatter(prog.size)
                                            : '-'
                                    }`}
                                />
                            </ListItem>
                        );
                    } else {
                        return (
                            <ListItem withHorizontalPadding>
                                <ListItem.Content
                                    title={item.musicItem.title}
                                    description="等待下载"
                                />
                            </ListItem>
                        );
                    }
                }}
            />
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
    downloading: {
        flexGrow: 0,
    },
});
