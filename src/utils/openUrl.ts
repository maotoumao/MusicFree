import { Linking } from "react-native";
import Toast from "./toast";

export default async function (url: string) {
    try {
        await Linking.canOpenURL(url);
        return Linking.openURL(url);
    } catch {
        Toast.warn("无法打开链接");
    }
}
