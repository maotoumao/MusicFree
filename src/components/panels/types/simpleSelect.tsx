import React, {Fragment} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from '@/components/base/themeText';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import PanelBase from '../base/panelBase';
import {hidePanel} from '../usePanel';
import ListItem from '@/components/base/listItem';
import Divider from '@/components/base/divider';

interface ICandidateItem {
    title?: string;
    value: any;
}

interface ISimpleSelectProps {
    height?: number;
    header?: string;
    candidates?: Array<ICandidateItem>;
    onPress?: (item: ICandidateItem) => void;
}

export default function SimpleSelect(props: ISimpleSelectProps) {
    const {height = rpx(520), header, candidates = [], onPress} = props ?? {};

    const safeAreaInsets = useSafeAreaInsets();

    return (
        <PanelBase
            height={height}
            renderBody={() => (
                <>
                    <View style={styles.header}>
                        <ThemeText fontWeight="bold" fontSize="title">
                            {header}
                        </ThemeText>
                    </View>
                    <Divider />
                    <ScrollView
                        style={[
                            styles.body,
                            {marginBottom: safeAreaInsets.bottom},
                        ]}>
                        {candidates.map((it, index) => {
                            return (
                                <Fragment key={`frag-${index}`}>
                                    <ListItem
                                        heightType="small"
                                        withHorizonalPadding
                                        onPress={() => {
                                            onPress?.(it);
                                            hidePanel();
                                        }}>
                                        <ListItem.Content
                                            title={it.title ?? it.value}
                                        />
                                    </ListItem>
                                </Fragment>
                            );
                        })}
                    </ScrollView>
                </>
            )}
        />
    );
}

const styles = StyleSheet.create({
    header: {
        width: '100%',
        flexDirection: 'row',
        padding: rpx(24),
    },
    body: {
        flex: 1,
    },
    item: {
        height: rpx(96),
        justifyContent: 'center',
    },
});
