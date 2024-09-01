import React, {memo} from 'react';
import {SectionList, SectionListProps, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {IPluginTopListResult} from '../store/atoms';
import {RequestStateCode} from '@/constants/commonConst';
import Loading from '@/components/base/loading';
import Empty from '@/components/base/empty';
import TopListItem from '@/components/mediaItem/topListItem';
import ThemeText from '@/components/base/themeText';

interface IBoardPanelProps {
    hash: string;
    topListData: IPluginTopListResult;
}
function BoardPanel(props: IBoardPanelProps) {
    const {hash, topListData} = props ?? {};

    const renderItem: SectionListProps<IMusic.IMusicSheetItemBase>['renderItem'] =
        ({item}) => {
            return <TopListItem topListItem={item} pluginHash={hash} />;
        };

    const renderSectionHeader: SectionListProps<IMusic.IMusicSheetItemBase>['renderSectionHeader'] =
        ({section: {title}}) => {
            return (
                <View style={style.sectionHeader}>
                    <ThemeText fontWeight="bold" fontSize="title">
                        {title}
                    </ThemeText>
                </View>
            );
        };

    return topListData?.state !== RequestStateCode.FINISHED ? (
        <Loading />
    ) : (
        <SectionList
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            ListEmptyComponent={<Empty />}
            sections={topListData?.data || []}
        />
    );
}

export default memo(
    BoardPanel,
    (prev, curr) => prev.topListData === curr.topListData,
);

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
    },
    sectionHeader: {
        marginTop: rpx(28),
        marginBottom: rpx(24),
        marginLeft: rpx(24),
    },
});
