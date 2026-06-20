import StatusBar from "@/components/base/statusBar";
import VerticalSafeAreaView from "@/components/base/verticalSafeAreaView";
import globalStyle from "@/constants/globalStyle";
import Body from "./components/body";
import Bottom from "./components/bottom";
import NavBar from "./components/navBar";
import Business from "./components/business";

export default function MusicListEditor() {
    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <Business />
            <StatusBar />
            <NavBar />
            <Body />
            <Bottom />
        </VerticalSafeAreaView>
    );
}
