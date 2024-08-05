import React, {Fragment} from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import PanelBase from '../base/panelBase';
import {hidePanel} from '../usePanel';
import ListItem from '@/components/base/listItem';
import PanelHeader from '../base/panelHeader';

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
    const {
        height = rpx(520),
        header = '',
        candidates = [],
        onPress,
    } = props ?? {};

    const safeAreaInsets = useSafeAreaInsets();

    return (
        <PanelBase
            height={height}
            renderBody={() => (
                <>
                    <PanelHeader title={header} hideButtons />

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
                                        withHorizontalPadding
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
