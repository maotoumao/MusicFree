import React from 'react';
import {StyleSheet, View} from 'react-native';

import NavBar from './components/navBar';
import Operations from './components/operations';
import MySheets from './components/mySheets';
import MusicBar from '@/components/musicBar';
import {Divider} from 'react-native-paper';
import {createDrawerNavigator} from '@react-navigation/drawer';
import HomeDrawer from './components/drawer';
import {SafeAreaView} from 'react-native-safe-area-context';
import StatusBar from '@/components/base/statusBar';
import useOrientation from '@/hooks/useOrientation';
import HorizonalSafeAreaView from '@/components/base/horizonalSafeAreaView';
import globalStyle from '@/constants/globalStyle';

function Home() {
    return (
        <SafeAreaView edges={['top', 'bottom']} style={styles.appWrapper}>
            <StatusBar backgroundColor="transparent" />
            <HorizonalSafeAreaView style={globalStyle.flex1}>
                <>
                    <NavBar />
                    <Divider />
                    <Body />
                </>
            </HorizonalSafeAreaView>
            <MusicBar />
        </SafeAreaView>
    );
}

function Body() {
    const orientation = useOrientation();
    return (
        <View
            style={[
                styles.appWrapper,
                orientation === 'horizonal' ? styles.flexRow : null,
            ]}>
            <Operations orientation={orientation} />
            <MySheets />
        </View>
    );
}

const LeftDrawer = createDrawerNavigator();
export default function App() {
    return (
        <LeftDrawer.Navigator
            screenOptions={{
                headerShown: false,
                drawerStyle: {
                    width: '80%',
                },
            }}
            initialRouteName="HOME-MAIN"
            drawerContent={props => <HomeDrawer {...props} />}>
            <LeftDrawer.Screen name="HOME-MAIN" component={Home} />
        </LeftDrawer.Navigator>
    );
}

const styles = StyleSheet.create({
    appWrapper: {
        flexDirection: 'column',
        flex: 1,
    },
    flexRow: {
        flexDirection: 'row',
    },
});
