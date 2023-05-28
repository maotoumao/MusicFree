import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx, {vh} from '@/utils/rpx';
import ThemeText from '@/components/base/themeText';

import {useSafeAreaInsets} from 'react-native-safe-area-context';
import PanelBase from '../base/panelBase';
import {ScrollView} from 'react-native-gesture-handler';
import {Divider} from 'react-native-paper';
import TypeTag from '@/components/base/typeTag';
import useColors from '@/hooks/useColors';

interface ISheetTagsProps {
    tags: IMusic.IMusicSheetGroupItem[];
    /** 点击tag */
    onTagPressed: (tag: ICommon.IUnique) => void;
}

export default function SheetTags(props: ISheetTagsProps) {
    const {tags, onTagPressed} = props ?? {};

    const safeAreaInsets = useSafeAreaInsets();
    const colors = useColors();

    const backgroundColor = colors.backdrop;

    return (
        <PanelBase
            height={vh(70)}
            renderBody={() => (
                <>
                    <View style={style.header}>
                        <ThemeText fontSize="title">歌单类别</ThemeText>
                    </View>
                    <Divider />
                    <ScrollView
                        style={[
                            style.body,
                            {marginBottom: safeAreaInsets.bottom},
                        ]}>
                        <View style={style.groupItem}>
                            <TypeTag
                                backgroundColor={backgroundColor}
                                title="默认"
                                style={style.tagItem}
                                onPress={() => {
                                    onTagPressed({
                                        title: '默认',
                                        id: '',
                                    });
                                }}
                            />
                        </View>
                        {tags.map((tagGroupItem, index) => (
                            <>
                                <View
                                    style={style.groupItem}
                                    key={tagGroupItem.title ?? index}>
                                    {tagGroupItem.title ? (
                                        <ThemeText
                                            fontSize="content"
                                            fontWeight="medium">
                                            {tagGroupItem.title}
                                        </ThemeText>
                                    ) : null}
                                </View>
                                <View style={style.groupItem}>
                                    {tagGroupItem.data.map(_ => (
                                        <TypeTag
                                            key={_.id}
                                            backgroundColor={backgroundColor}
                                            title={_.title}
                                            style={style.tagItem}
                                            onPress={() => {
                                                onTagPressed(_);
                                            }}
                                        />
                                    ))}
                                </View>
                            </>
                        ))}
                    </ScrollView>
                </>
            )}
        />
    );
}

const style = StyleSheet.create({
    header: {
        width: '100%',
        flexDirection: 'row',
        padding: rpx(24),
        marginTop: rpx(12),
    },
    body: {
        flex: 1,
        paddingHorizontal: rpx(24),
    },
    item: {
        height: rpx(96),
        justifyContent: 'center',
    },
    groupItem: {
        flexDirection: 'row',
        paddingVertical: rpx(12),
        flexWrap: 'wrap',
    },
    tagItem: {
        marginLeft: 0,
        marginBottom: rpx(20),
    },
});
