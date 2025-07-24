import React from "react";
// import {ROUTE_PATH, useNavigate} from '@/entry/router';
import ListItem from "@/components/base/listItem";
import { ImgAsset } from "@/constants/assetsConst";
import { ROUTE_PATH, useNavigate } from "@/core/router";

interface ITopListResultsProps {
    pluginHash: string;
    topListItem: IMusic.IMusicSheetItemBase;
}

export default function TopListItem(props: ITopListResultsProps) {
    const { pluginHash, topListItem } = props;
    const navigate = useNavigate();

    return (
        <ListItem
            withHorizontalPadding
            onPress={() => {
                navigate(ROUTE_PATH.TOP_LIST_DETAIL, {
                    pluginHash: pluginHash,
                    topList: topListItem,
                });
            }}>
            <ListItem.ListItemImage
                uri={topListItem?.coverImg}
                fallbackImg={ImgAsset.albumDefault}
            />
            <ListItem.Content
                title={topListItem.title}
                description={`${topListItem.description ?? ""}`}
            />
        </ListItem>
    );
}
