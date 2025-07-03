import React from "react";
import ListItem from "@/components/base/listItem";
import { ImgAsset } from "@/constants/assetsConst";
import { ROUTE_PATH, useNavigate } from "@/core/router";
import TitleAndTag from "@/components/mediaItem/titleAndTag";
import { useI18N } from "@/core/i18n";

interface IArtistResultsProps {
    item: IArtist.IArtistItem;
    index: number;
    pluginHash: string;
}
export default function ArtistResultItem(props: IArtistResultsProps) {
    const { item: artistItem, pluginHash } = props;
    const navigate = useNavigate();
    const { t } = useI18N();

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
                        : `${artistItem.worksNum
                            ? t("searchPage.artistResultWorksNum", {
                                count: artistItem.worksNum,
                            })
                            : ""
                        }    ${artistItem.description ?? ""}`
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
