import React from 'react';
import {Divider} from 'react-native-paper';

import Header from './header';
import Body from './body';
import PanelBase from '../../base/panelBase';

export default function () {
    return (
        <PanelBase
            renderBody={loading => (
                <>
                    <Header />
                    <Divider />
                    <Body loading={loading} />
                </>
            )}
        />
    );
}
