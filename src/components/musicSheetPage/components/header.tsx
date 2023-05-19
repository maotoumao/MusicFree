import React, {useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import LinearGradient from 'react-native-linear-gradient';
import {Divider, useTheme} from 'react-native-paper';
import Color from 'color';
import ThemeText from '@/components/base/themeText';
import {ImgAsset} from '@/constants/assetsConst';
import FastImage from '@/components/base/fastImage';
import PlayAllBar from '@/components/base/playAllBar';

interface IHeaderProps {
    topListDetail: IMusic.IMusicTopListItem | null;
    musicList: IMusic.IMusicItem[] | null;
}
export default function Header(props: IHeaderProps) {
    const {topListDetail, musicList} = props;
    const {colors} = useTheme();

    const [maxLines, setMaxLines] = useState<number | undefined>(6);

    const toggleShowMore = () => {
        if (maxLines) {
            setMaxLines(undefined);
        } else {
            setMaxLines(6);
        }
    };

    return (
        <>
            <LinearGradient
                colors={[
                    Color(colors.primary).alpha(0.8).toString(),
                    Color(colors.primary).alpha(0.15).toString(),
                ]}
                style={style.wrapper}>
                <View style={style.content}>
                    <FastImage
                        style={style.coverImg}
                        uri={topListDetail?.artwork ?? topListDetail?.coverImg}
                        emptySrc={ImgAsset.albumDefault}
                    />
                    <View style={style.details}>
                        <ThemeText>{topListDetail?.title}</ThemeText>
                        <ThemeText fontColor="secondary" fontSize="description">
                            共
                            {topListDetail?.worksNum ??
                                (musicList ? musicList.length ?? 0 : '-')}
                            首{' '}
                        </ThemeText>
                    </View>
                </View>
                <Divider style={style.divider} />
                {topListDetail?.description ? (
                    <Pressable onPress={toggleShowMore}>
                        <View
                            style={style.albumDesc}
                            // onLayout={evt => {
                            //     console.log(evt.nativeEvent.layout);
                            // }}
                        >
                            <ThemeText
                                fontColor="secondary"
                                fontSize="description"
                                numberOfLines={maxLines}>
                                {topListDetail.description}
                            </ThemeText>
                        </View>
                    </Pressable>
                ) : null}
            </LinearGradient>
            <PlayAllBar
                sheetName={topListDetail?.title}
                musicList={musicList}
            />
        </>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        padding: rpx(24),
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    content: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'flex-start',
        alignItems: 'center',
    },
    coverImg: {
        width: rpx(210),
        height: rpx(210),
        borderRadius: rpx(24),
    },
    details: {
        flex: 1,
        height: rpx(140),
        paddingHorizontal: rpx(36),
        justifyContent: 'space-between',
    },
    divider: {
        marginVertical: rpx(18),
    },

    albumDesc: {
        width: '100%',
        paddingHorizontal: rpx(24),
    },
});
