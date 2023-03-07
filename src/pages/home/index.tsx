import React from 'react';
import {StyleSheet} from 'react-native';

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

function Home() {
    return (
        <SafeAreaView edges={['top', 'bottom']} style={styles.appWrapper}>
            <StatusBar backgroundColor="transparent" />
            <NavBar />
            <Divider />
            <Body />
            <MusicBar />
        </SafeAreaView>
    );
}

function Body() {
    const orientation = useOrientation();
    return (
        <SafeAreaView
            edges={['left', 'right']}
            style={[
                styles.appWrapper,
                orientation === 'horizonal'
                    ? {
                          flexDirection: 'row',
                      }
                    : null,
            ]}>
            <Operations />
            <MySheets />
        </SafeAreaView>
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
});
