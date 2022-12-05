export const ImgAsset = {
    albumDefault: require('@/assets/imgs/album-default.jpeg'),
    backgroundDefault: require('@/assets/imgs/background.jpeg'),
    addBackground: require('@/assets/imgs/add-image.png'),
    add: require('@/assets/imgs/add.png'),
    logo: require('@/assets/imgs/logo.jpg'),
    wechatChannel: require('@/assets/imgs/wechat_channel.jpg'),
    // 音质
    quality: {
        low: require('@/assets/imgs/low-quality.png'),
        standard: require('@/assets/imgs/standard-quality.png'),
        high: require('@/assets/imgs/high-quality.png'),
        super: require('@/assets/imgs/super-quality.png'),
    },
    standardQuality: require('@/assets/imgs/standard-quality.png'),
    lowQuality: require,
} as const;

export const SoundAsset = {
    // 静音的音频，https://github.com/anars/blank-audio/blob/master/15-seconds-of-silence.mp3
    fakeAudio: require('@/assets/sounds/fake-audio.mp3'),
};
