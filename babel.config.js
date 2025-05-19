module.exports = {
    presets: ['babel-preset-expo'],
    plugins: [
        [
            'module-resolver',
            {
                root: ['./'],
                alias: {
                    '^@/(.+)': './src/\\1',
                    'webdav': "webdav/dist/react-native"
                },
            },
        ],
        'react-native-reanimated/plugin',
    ],
    env: {
        production: {
            plugins: ['transform-remove-console'],
        },
    },
};
