import React from 'react';
import { StyleSheet, View } from 'react-native';
import rpx from '@/utils/rpx';
import ListItem from '@/components/base/listItem';
import { sizeFormatter } from '@/utils/fileUtils';
import { DownloadFailReason, DownloadStatus, useDownloadQueue, useDownloadTask } from '@/core/downloader';
import { FlashList } from '@shopify/flash-list';


interface DownloadingListItemProps {
    musicItem: IMusic.IMusicItem;
}
function DownloadingListItem(props: DownloadingListItemProps) {
    const { musicItem } = props;
    const taskInfo = useDownloadTask(musicItem);

    const status = taskInfo?.status ?? DownloadStatus.Error;

    let description = "";

    if (status === DownloadStatus.Error) {
        const reason = taskInfo?.errorReason;

        if (reason === DownloadFailReason.NoWritePermission) {
            description = "没有写入文件的权限";
        } else if (reason === DownloadFailReason.FailToFetchSource) {
            description = "获取音乐源失败";
        } else {
            description = "未知错误";
        }
    } else if (status === DownloadStatus.Completed) {
        description = "下载完成";
    } else if (status === DownloadStatus.Downloading) {
        const progress = taskInfo?.downloadedSize ? sizeFormatter(taskInfo.downloadedSize) : '-';
        const totalSize = taskInfo?.fileSize ? sizeFormatter(taskInfo.fileSize) : '-';

        description = "下载中: " + progress + " / " + totalSize;
    } else if (status === DownloadStatus.Pending) {
        description = "等待下载";
    } else if (status === DownloadStatus.Preparing) {
        description = "正在获取音乐资源链接";
    }

    return <ListItem withHorizontalPadding>
        <ListItem.Content
            title={musicItem.title}
            description={description}
         />
    </ListItem>

}

export default function DownloadingList() {
    const downloadQueue = useDownloadQueue();


    return (
        <View style={style.wrapper}>
            <FlashList
                style={style.downloading}
                data={downloadQueue}
                keyExtractor={_ => `dl${_.platform}.${_.id}`}
                renderItem={({ item }) => {
                    return <DownloadingListItem musicItem={item} />
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
