import Config from "@/core/appConfig";

import { DarkTheme as _DarkTheme, DefaultTheme as _DefaultTheme } from "@react-navigation/native";
import { GlobalState } from "@/utils/stateMapper";
import { CustomizedColors } from "@/hooks/useColors";
import Color from "color";

export const lightTheme = {
    id: "p-light",
    ..._DefaultTheme,
    colors: {
        ..._DefaultTheme.colors,
        background: "transparent",
        text: "#333333",
        textSecondary: Color("#333333").alpha(0.7).toString(),
        primary: "#f17d34",
        pageBackground: "#fafafa",
        shadow: "#000",
        appBar: "#f17d34",
        appBarText: "#fefefe",
        musicBar: "#f2f2f2",
        musicBarText: "#333333",
        divider: "rgba(0,0,0,0.1)",
        listActive: "rgba(0,0,0,0.1)", // 在手机上表现是ripple
        mask: "rgba(51,51,51,0.2)",
        backdrop: "#f0f0f0",
        tabBar: "#f0f0f0",
        placeholder: "#eaeaea",
        success: "#08A34C",
        danger: "#FC5F5F",
        info: "#0A95C8",
        card: "#e2e2e288",
        notification: "#f0f0f0",
    },
};

export const darkTheme = {
    id: "p-dark",
    ..._DarkTheme,
    colors: {
        ..._DarkTheme.colors,
        background: "transparent",
        text: "#fcfcfc",
        textSecondary: Color("#fcfcfc").alpha(0.7).toString(),
        primary: "#3FA3B5",
        pageBackground: "#202020",
        shadow: "#999",
        appBar: "#262626",
        appBarText: "#fcfcfc",
        musicBar: "#262626",
        musicBarText: "#fcfcfc",
        divider: "rgba(255,255,255,0.1)",
        listActive: "rgba(255,255,255,0.1)", // 在手机上表现是ripple
        mask: "rgba(33,33,33,0.8)",
        backdrop: "#303030",
        tabBar: "#303030",
        placeholder: "#424242",
        success: "#08A34C",
        danger: "#FC5F5F",
        info: "#0A95C8",
        card: "#33333388",
        notification: "#303030",
    },
};

/**
 * 暗夜暖金（Baka 风格）
 *
 * 配色思路来自 BakaMusic 的主题体系：界面底色不是纯中性灰，
 * 而是把主题色按不同比例混进深色基底里（官方写法是
 * color-mix(in srgb, var(--theme-primary) 10%, rgba(17,19,25,0.9))），
 * 越上层的浮层混入越多主题色，于是卡片、弹窗会透出一点暖调，
 * 也就是常说的"染色玻璃"质感。这正是纯灰配色显得寡淡的原因。
 *
 * 下面每个色值都是按「主题色 N% + 深色基底」实际算出来的，
 * 亮度依然保持 页面 < 顶栏/播放栏 < 浮层/卡片 的层次关系。
 */
export const bakaTheme = {
    id: "p-baka",
    ..._DarkTheme,
    colors: {
        ..._DarkTheme.colors,
        background: "transparent",
        text: "#f5f0e8",
        textSecondary: Color("#f5f0e8").alpha(0.76).toString(),
        primary: "#c4a574", // 暖金
        pageBackground: "#1a1a1e", // 主题色 5%
        shadow: "#000",
        appBar: "#1f1f20", // 主题色 8%
        appBarText: "#f5f0e8",
        musicBar: "#1f1f20",
        musicBarText: "#f5f0e8",
        divider: "rgba(245,240,232,0.12)",
        listActive: "rgba(196,165,116,0.16)", // 点按水波纹也带主题色
        mask: "rgba(14,16,22,0.82)",
        backdrop: "#262524", // 主题色 12%
        tabBar: "#262524",
        placeholder: "#35302b", // 主题色 20%
        success: "#4CAF7D",
        danger: "#FF6B5B",
        info: "#5AB8D6",
        card: "#2c292788", // 主题色 15%
        notification: "#262524",
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
    const currentTheme = Config.getConfig("theme.selectedTheme") ?? "p-dark";

    if (currentTheme === "p-dark") {
        themeStore.setValue(darkTheme);
    } else if (currentTheme === "p-light") {
        themeStore.setValue(lightTheme);
    } else if (currentTheme === "p-baka") {
        themeStore.setValue(bakaTheme);
    } else {
        themeStore.setValue({
            id: currentTheme,
            dark: true,
            // @ts-ignore
            colors:
                (Config.getConfig("theme.colors") as CustomizedColors) ??
                darkTheme.colors,
        });
    }

    const bgUrl = Config.getConfig("theme.background");
    const bgBlur = Config.getConfig("theme.backgroundBlur");
    const bgOpacity = Config.getConfig("theme.backgroundOpacity");

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
    if (themeName === "p-light") {
        themeStore.setValue(lightTheme);
    } else if (themeName === "p-dark") {
        themeStore.setValue(darkTheme);
    } else if (themeName === "p-baka") {
        themeStore.setValue(bakaTheme);
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

    Config.setConfig("theme.selectedTheme", themeName);
    Config.setConfig("theme.colors", themeStore.getValue().colors);

    if (extra?.background) {
        const currentBg = backgroundStore.getValue();
        let newBg: IBackgroundInfo = {
            blur: 20,
            opacity: 0.6,
            ...(currentBg ?? {}),
            url: undefined,
        };
        if (typeof extra.background.blur === "number") {
            newBg.blur = extra.background.blur;
        }
        if (typeof extra.background.opacity === "number") {
            newBg.opacity = extra.background.opacity;
        }
        if (extra.background.url) {
            newBg.url = extra.background.url;
        }

        Config.setConfig("theme.background", newBg.url);
        Config.setConfig("theme.backgroundBlur", newBg.blur);
        Config.setConfig("theme.backgroundOpacity", newBg.opacity);

        backgroundStore.setValue(newBg);
    }
}

function setColors(colors: Partial<CustomizedColors>) {
    const currentTheme = themeStore.getValue();
    // 内置主题（含 baka）不接受自定义颜色覆盖，只有 "custom" 主题才可以改
    if (
        currentTheme.id !== "p-light" &&
        currentTheme.id !== "p-dark" &&
        currentTheme.id !== "p-baka"
    ) {
        const newTheme = {
            ...currentTheme,
            colors: {
                ...currentTheme.colors,
                ...colors,
            },
        };
        Config.setConfig("theme.customColors", newTheme.colors);
        Config.setConfig("theme.colors", newTheme.colors);
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
    if (typeof backgroundInfo.blur === "number") {
        Config.setConfig("theme.backgroundBlur", backgroundInfo.blur);
        newBgInfo.blur = backgroundInfo.blur;
    }
    if (typeof backgroundInfo.opacity === "number") {
        Config.setConfig("theme.backgroundOpacity", backgroundInfo.opacity);
        newBgInfo.opacity = backgroundInfo.opacity;
    }
    if (backgroundInfo.url !== undefined) {
        Config.setConfig("theme.background", backgroundInfo.url);
        newBgInfo.url = backgroundInfo.url;
    }
    backgroundStore.setValue(newBgInfo);
}

const configableColorKey: Array<keyof CustomizedColors> = [
    "primary",
    "text",
    "appBar",
    "appBarText",
    "musicBar",
    "musicBarText",
    "pageBackground",
    "backdrop",
    "card",
    "placeholder",
    "tabBar",
    "notification",
];


const Theme = {
    setup,
    setTheme,
    setBackground,
    setColors,
    useTheme: themeStore.useValue,
    getTheme: themeStore.getValue,
    useBackground: backgroundStore.useValue,
    configableColorKey,
};

export default Theme;
