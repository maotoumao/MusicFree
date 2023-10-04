import React from 'react';
import {StyleSheet, View} from 'react-native';
import ThemeText from '../base/themeText';
import Tag from '../base/tag';

interface ITitleAndTagProps {
    title: string;
    tag?: string;
}
export default function TitleAndTag(props: ITitleAndTagProps) {
    const {title, tag} = props;
    return (
        <View style={styles.container}>
            <ThemeText numberOfLines={1} style={styles.title}>
                {title}
            </ThemeText>
            {tag ? <Tag tagName={tag} /> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    title: {
        flex: 1,
    },
});
