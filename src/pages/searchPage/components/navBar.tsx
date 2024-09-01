import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {useAtom, useSetAtom} from 'jotai';
import {
    initSearchResults,
    PageStatus,
    pageStatusAtom,
    queryAtom,
    searchResultsAtom,
} from '../store/atoms';
import useSearch from '../hooks/useSearch';
import {addHistory} from '../common/historySearch';
import useColors from '@/hooks/useColors';
import AppBar from '@/components/base/appBar';
import Input from '@/components/base/input';
import Color from 'color';
import Button from '@/components/base/textButton.tsx';
import IconButton from '@/components/base/iconButton';
import {iconSizeConst} from '@/constants/uiConst';
import Icon from '@/components/base/icon.tsx';

export default function NavBar() {
    const search = useSearch();
    const [query, setQuery] = useAtom(queryAtom);
    const setPageStatus = useSetAtom(pageStatusAtom);
    const colors = useColors();
    const setSearchResultsState = useSetAtom(searchResultsAtom);

    const onSearchSubmit = async () => {
        if (query === '') {
            return;
        }
        setSearchResultsState(initSearchResults);
        setPageStatus(prev =>
            prev === PageStatus.EDITING ? PageStatus.SEARCHING : prev,
        );
        await search(query, 1);
        await addHistory(query);
    };

    const hintTextColor = Color(colors.text).alpha(0.6).toString();

    return (
        <AppBar containerStyle={style.appbar} contentStyle={style.appbar}>
            <View style={style.searchBarContainer}>
                <Icon
                    name="magnifying-glass"
                    color={hintTextColor}
                    size={iconSizeConst.small}
                    style={style.magnify}
                />
                <Input
                    autoFocus
                    style={[
                        style.searchBar,
                        {
                            color: colors.text,
                            backgroundColor: colors.pageBackground,
                        },
                    ]}
                    accessible
                    accessibilityLabel="搜索框"
                    accessibilityHint={'输入要搜索的歌曲'}
                    onFocus={() => {
                        setPageStatus(PageStatus.EDITING);
                    }}
                    placeholderTextColor={hintTextColor}
                    placeholder="输入要搜索的歌曲"
                    onSubmitEditing={onSearchSubmit}
                    onChangeText={_ => {
                        if (_ === '') {
                            setPageStatus(PageStatus.EDITING);
                        }
                        setQuery(_);
                    }}
                    value={query}
                />
                {query.length ? (
                    <IconButton
                        style={style.close}
                        sizeType="light"
                        onPress={() => {
                            setQuery('');
                            setPageStatus(PageStatus.EDITING);
                        }}
                        color={hintTextColor}
                        name="x-mark"
                    />
                ) : null}
            </View>
            <Button
                style={[style.button]}
                hitSlop={0}
                fontColor={'appBarText'}
                onPress={onSearchSubmit}>
                搜索
            </Button>
        </AppBar>
    );
}

const style = StyleSheet.create({
    appbar: {
        paddingRight: 0,
    },
    button: {
        paddingHorizontal: rpx(24),
        height: '100%',
        justifyContent: 'center',
    },
    searchBarContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    searchBar: {
        minWidth: rpx(375),
        flex: 1,
        paddingHorizontal: rpx(64),
        borderRadius: rpx(64),
        height: rpx(64),
        maxHeight: rpx(64),
        alignItems: 'center',
    },
    magnify: {
        position: 'absolute',
        left: rpx(16),
        zIndex: 100,
    },
    close: {
        position: 'absolute',
        right: rpx(16),
    },
});
