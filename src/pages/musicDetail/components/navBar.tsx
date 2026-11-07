import React from "react";
import { StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import { useNavigation } from "@react-navigation/native";
import IconButton from "@/components/base/iconButton";

export default function NavBar() {
    const navigation = useNavigation();

    return (
        <View style={styles.container}>
            <IconButton
                name="arrow-left"
                sizeType={"normal"}
                color="white"
                style={styles.button}
                onPress={() => {
                    navigation.goBack();
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: "100%",
        height: rpx(96),
        flexDirection: "row",
        alignItems: "center",
    },
    button: {
        marginHorizontal: rpx(24),
    },
});
