import Config from '@/core/config';

import {
    DarkTheme as _DarkTheme,
    DefaultTheme as _DefaultTheme,
} from '@react-navigation/native';
import {GlobalState} from '@/utils/stateMapper';
import {CustomizedColors} from '@/hooks/useColors';

export const lightTheme = {
    id: 'p-light',
    ..._DefaultTheme,
    colors: {
        ..._DefaultTheme.colors,
        primary: '#f17d34',
        background: 'transparent',
        _background: '#fafafa',
        divider: 'rgba(0,0,0,0.1)',
        text: '#333333',
        listActive: 'rgba(0,0,0,0.1)', // 在手机上表现是ripple
        mask: 'rgba(51,51,51,0.2)',
        shadow: '#000',
        backdrop: '#f0f0f0',
        placeholder: '#eaeaea',
        success: '#08A34C',
        danger: '#FC5F5F',
        info: '#0A95C8',
        musicBar: '#fff',
        appBar: '#f17d34',
        headerText: '#fefefe',
    },
};

export const darkTheme = {
    id: 'p-dark',
    ..._DarkTheme,
    colors: {
        ..._DarkTheme.colors,
        primary: '#3FA3B5',
        background: 'transparent',
        _background: '#202020',
        divider: 'rgba(255,255,255,0.1)',
        text: '#fcfcfc',
        listActive: 'rgba(255,255,255,0.1)', // 在手机上表现是ripple
        mask: 'rgba(33,33,33,0.8)',
        shadow: '#666',
        backdrop: '#303030',
        placeholder: '#424242',
        success: '#08A34C',
        danger: '#FC5F5F',
        info: '#0A95C8',
        appBar: '#262626',
        musicBar: '#262626',
        headerText: '#fcfcfc',
    },
};

interface IBackgroundInfo {
    url?: string;
    blur?: number;
    opacity?: number;
}

const themeStore = new GlobalState(darkTheme);
const backgroundStore = new GlobalState<IBackgroundInfo | null>(null);

function setup() {
    const currentTheme = Config.get('setting.theme.selectedTheme') ?? 'p-dark';

    if (currentTheme === 'p-dark') {
        themeStore.setValue(darkTheme);
    } else if (currentTheme === 'p-light') {
        themeStore.setValue(lightTheme);
    } else {
        themeStore.setValue({
            id: currentTheme,
            dark: true,
            // @ts-ignore
            colors:
                (Config.get('setting.theme.colors') as CustomizedColors) ??
                darkTheme.colors,
        });
    }

    const bgUrl = Config.get('setting.theme.background');
    const bgBlur = Config.get('setting.theme.backgroundBlur');
    const bgOpacity = Config.get('setting.theme.backgroundOpacity');

    backgroundStore.setValue({
        url: bgUrl,
        blur: bgBlur ?? 20,
        opacity: bgOpacity ?? 0.6,
    });
}

function setTheme(
    themeName: string,
    extra?: {
        colors?: Partial<CustomizedColors>;
        background?: IBackgroundInfo;
    },
) {
    if (themeName === 'p-light') {
        themeStore.setValue(lightTheme);
    } else if (themeName === 'p-dark') {
        themeStore.setValue(darkTheme);
    } else {
        themeStore.setValue({
            id: themeName,
            dark: true,
            colors: {
                ...darkTheme.colors,
                ...(extra?.colors ?? {}),
            },
        });
    }

    Config.set('setting.theme.selectedTheme', themeName);
    Config.set('setting.theme.colors', themeStore.getValue().colors);

    if (extra?.background) {
        const currentBg = backgroundStore.getValue();
        let newBg: IBackgroundInfo = {
            blur: 20,
            opacity: 0.6,
            ...(currentBg ?? {}),
            url: undefined,
        };
        if (extra.background.blur) {
            newBg.blur = extra.background.blur;
        }
        if (extra.background.opacity) {
            newBg.opacity = extra.background.opacity;
        }
        if (extra.background.url) {
            newBg.url = extra.background.url;
        }

        Config.set('setting.theme.background', newBg.url);
        Config.set('setting.theme.backgroundBlur', newBg.blur);
        Config.set('setting.theme.backgroundOpacity', newBg.opacity);

        backgroundStore.setValue(newBg);
    }
}

function setColors(colors: Partial<CustomizedColors>) {
    const currentTheme = themeStore.getValue();
    if (currentTheme.id !== 'p-light' && currentTheme.id !== 'p-dark') {
        const newTheme = {
            ...currentTheme,
            colors: {
                ...currentTheme.colors,
                ...colors,
            },
        };

        Config.set('setting.theme.colors', newTheme.colors);
        themeStore.setValue(newTheme);
    }
}

function setBackground(backgroundInfo: Partial<IBackgroundInfo>) {
    const currentBackgroundInfo = backgroundStore.getValue();
    let newBgInfo = {
        ...(currentBackgroundInfo ?? {
            opacity: 0.6,
            blur: 20,
        }),
    };
    if (backgroundInfo.blur) {
        Config.set('setting.theme.backgroundBlur', backgroundInfo.blur);
        newBgInfo.blur = backgroundInfo.blur;
    }
    if (backgroundInfo.opacity) {
        Config.set('setting.theme.backgroundOpacity', backgroundInfo.opacity);
        newBgInfo.opacity = backgroundInfo.opacity;
    }
    if (backgroundInfo.url !== undefined) {
        Config.set('setting.theme.background', backgroundInfo.url);
        newBgInfo.url = backgroundInfo.url;
    }
    backgroundStore.setValue(newBgInfo);
}

const configableColorKey: Array<keyof CustomizedColors> = [
    'appBar',
    'musicBar',
    'primary',
    '_background',
    'headerText',
    'text',
];

const colorDesc: Record<string, string> = {
    appBar: '标题栏背景色',
    headerText: '标题栏文字颜色',
    text: '文字颜色',
    musicBar: '音乐栏背景色',
    primary: '主题色',
    _background: '背景色',
};

const Theme = {
    setup,
    setTheme,
    setBackground,
    setColors,
    useTheme: themeStore.useValue,
    getTheme: themeStore.getValue,
    useBackground: backgroundStore.useValue,
    configableColorKey,
    colorDesc,
};

export default Theme;
