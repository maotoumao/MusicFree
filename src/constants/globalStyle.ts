import { StyleSheet } from "react-native";

const globalStyle = StyleSheet.create({
    /** flex 1 */
    flex1: {
        flex: 1,
    },
    /** 满宽度 flex1 */
    fwflex1: {
        width: "100%",
        flex: 1,
    },
    /** row 满宽度 flex1 */
    rowfwflex1: {
        width: "100%",
        flex: 1,
        flexDirection: "row",
    },
    /** 居中 */
    fullCenter: {
        width: "100%",
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    notShrink: {
        flexShrink: 0,
        flexGrow: 0,
    },
    grow: {
        flexShrink: 0,
        flexGrow: 1,
    },
} as const);

export default globalStyle;
