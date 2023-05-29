import React, {memo} from 'react';
import rpx from '@/utils/rpx';
import {FlashList} from '@shopify/flash-list';
import useRecommendSheets from '../../hooks/useRecommendSheets';
import Empty from '@/components/base/empty';
import ListLoading from '@/components/base/listLoading';
import ListReachEnd from '@/components/base/listReachEnd';
import SheetItem from '@/components/mediaItem/sheetItem';
import useOrientation from '@/hooks/useOrientation';

interface ISheetListProps {
    tag: ICommon.IUnique;
    pluginHash: string;
}

function SheetList(props: ISheetListProps) {
    const {tag, pluginHash} = props ?? {};

    const [query, sheets, status] = useRecommendSheets(pluginHash, tag);

    function renderItem({item}: {item: IMusic.IMusicSheetItemBase}) {
        return <SheetItem sheetInfo={item} pluginHash={pluginHash} />;
    }
    const orientation = useOrientation();

    return (
        <FlashList
            ListEmptyComponent={status !== 'loading' ? Empty : null}
            ListFooterComponent={
                status === 'loading' ? (
                    <ListLoading />
                ) : status === 'done' ? (
                    <ListReachEnd />
                ) : (
                    <></>
                )
            }
            onEndReached={() => {
                query();
            }}
            onEndReachedThreshold={0.1}
            estimatedItemSize={rpx(306)}
            numColumns={orientation === 'vertical' ? 3 : 4}
            renderItem={renderItem}
            data={sheets}
        />
    );
}

export default memo(
    SheetList,
    (prev, curr) =>
        prev.tag.id === curr.tag.id && prev.pluginHash === curr.pluginHash,
);
