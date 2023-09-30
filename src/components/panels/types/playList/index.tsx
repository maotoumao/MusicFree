import React from 'react';

import Header from './header';
import Body from './body';
import PanelBase from '../../base/panelBase';
import Divider from '@/components/base/divider';

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
