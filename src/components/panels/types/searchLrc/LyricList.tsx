import Loading from "@/components/base/loading";
import LyricItem from "@/components/mediaItem/LyricItem";
import { RequestStateCode } from "@/constants/commonConst";
import lyricManager from "@/core/lyricManager";
import TrackPlayer from "@/core/trackPlayer";
import rpx from "@/utils/rpx";
import Toast from "@/utils/toast";
import React, { memo } from "react";
import { hidePanel } from "../../usePanel";
import searchResultStore, { ISearchLyricResult } from "./searchResultStore";
import ListEmpty from "@/components/base/listEmpty";
import ListFooter from "@/components/base/listFooter";
import { FlashList } from "@shopify/flash-list";
import { useI18N } from "@/core/i18n";

interface ILyricListWrapperProps {
    route: {
        key: string;
        title: string;
    };
}
export default function LyricListWrapper(props: ILyricListWrapperProps) {
    const hash = props.route.key;
    const dataStore = searchResultStore.useValue();
    return <LyricList data={dataStore.data[hash]} />;
}

interface ILyricListProps {
    data: ISearchLyricResult;
}

const ITEM_HEIGHT = rpx(120);
function LyricListImpl(props: ILyricListProps) {
    const data = props.data;
    const searchState = data?.state ?? RequestStateCode.IDLE;

    const { t } = useI18N();

    return searchState === RequestStateCode.PENDING_FIRST_PAGE ? (
        <Loading />
    ) : (
        <FlashList
            estimatedItemSize={ITEM_HEIGHT}
            renderItem={({ item }) => (
                <LyricItem
                    lyricItem={item}
                    onPress={async () => {
                        try {
                            const currentMusic = TrackPlayer.currentMusic;
                            if (!currentMusic) {
                                return;
                            }

                            lyricManager.associateLyric(currentMusic, item);
                            Toast.success(t("panel.searchLrc.toast.settingSuccess"));
                            hidePanel();
                            // 触发刷新歌词
                        } catch {
                            Toast.warn(t("panel.searchLrc.toast.failToSearch"));
                        }
                    }}
                />
            )}
            ListEmptyComponent={<ListEmpty state={searchState} />}
            ListFooterComponent={data?.data?.length ? <ListFooter state={searchState} /> : null}
            data={data?.data}
        />
    );
}

const LyricList = memo(LyricListImpl, (prev, curr) => prev.data === curr.data);
