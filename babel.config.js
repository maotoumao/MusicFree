const path = require('path');
try {
    require('dotenv').config({ path: path.resolve(__dirname, '.env.local') });
    require('dotenv').config({ path: path.resolve(__dirname, '.env') });
} catch (e) {
    console.warn('dotenv not found, skipping env loading');
}

module.exports = {
    presets: ['babel-preset-expo'],
    plugins: [
        [
            'transform-inline-environment-variables',
            {
                include: [
                    'EXPO_PUBLIC_AZURE_APPLICATION_INSIGHTS_CONNECTION_STRING'
                ]
            }
        ],
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
