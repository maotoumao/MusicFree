import React from 'react';
import ListItem from '@/components/base/listItem';
import {ImgAsset} from '@/constants/assetsConst';
import {ROUTE_PATH, useNavigate} from '@/entry/router';
import TitleAndTag from '@/components/mediaItem/titleAndTag';

interface IArtistResultsProps {
    item: IArtist.IArtistItem;
    index: number;
    pluginHash: string;
}
export default function ArtistResultItem(props: IArtistResultsProps) {
    const {item: artistItem, pluginHash} = props;
    const navigate = useNavigate();
    return (
        <ListItem
            withHorizontalPadding
            heightType="big"
            onPress={() => {
                navigate(ROUTE_PATH.ARTIST_DETAIL, {
                    artistItem: artistItem,
                    pluginHash,
                });
            }}>
            <ListItem.ListItemImage
                uri={artistItem.avatar}
                fallbackImg={ImgAsset.albumDefault}
            />
            <ListItem.Content
                description={
                    artistItem.desc
                        ? artistItem.desc
                        : `${
                              artistItem.worksNum
                                  ? artistItem.worksNum + '个作品' // TODO 用字符串模板函数更好
                                  : ''
                          }    ${artistItem.description ?? ''}`
                }
                title={
                    <TitleAndTag
                        title={artistItem.name}
                        tag={artistItem.platform}
                    />
                }
            />
        </ListItem>
    );
}
