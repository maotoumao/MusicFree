import React from 'react';
// import {ROUTE_PATH, useNavigate} from '@/entry/router';
import ListItem from '@/components/base/listItem';
import {ImgAsset} from '@/constants/assetsConst';

interface ITopListResultsProps {
    topListItem: IMusic.IMusicTopListItem;
}

export default function TopListItem(props: ITopListResultsProps) {
    const {topListItem} = props;
    // const navigate = useNavigate();

    return (
        <ListItem
            left={{
                artwork: topListItem?.coverImg,
                fallback: ImgAsset.albumDefault,
            }}
            title={topListItem.title}
            desc={`${topListItem.description}`}
            onPress={() => {
                console.log('测试');
            }}
        />
    );
}
