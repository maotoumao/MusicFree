module.exports = {
    root: true,
    extends: ['@react-native-community', 'plugin:prettier/recommended'],
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint', 'prettier'],
    overrides: [
        {
            files: ['*.ts', '*.tsx'],
            rules: {
                '@typescript-eslint/no-shadow': ['warn'],
                'no-shadow': 'off',
                'no-undef': 'off',
                'prettier/prettier': 'error',
                'react-hooks/exhaustive-deps': 'warn',
            },
        },
    ],
};
