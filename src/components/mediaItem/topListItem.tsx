import React from 'react';
// import {ROUTE_PATH, useNavigate} from '@/entry/router';
import ListItem from '@/components/base/listItem';
import {ImgAsset} from '@/constants/assetsConst';
import {ROUTE_PATH, useNavigate} from '@/entry/router';

interface ITopListResultsProps {
    pluginHash: string;
    topListItem: IMusic.IMusicTopListItem;
}

export default function TopListItem(props: ITopListResultsProps) {
    const {pluginHash, topListItem} = props;
    const navigate = useNavigate();

    return (
        <ListItem
            left={{
                artwork: topListItem?.coverImg,
                fallback: ImgAsset.albumDefault,
            }}
            title={topListItem.title}
            desc={`${topListItem.description ?? ''}`}
            onPress={() => {
                navigate(ROUTE_PATH.TOP_LIST_DETAIL, {
                    pluginHash: pluginHash,
                    topList: topListItem,
                });
            }}
        />
    );
}
