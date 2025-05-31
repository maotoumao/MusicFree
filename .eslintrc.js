module.exports = {
    root: true,
    extends: ['@react-native', 'prettier'],
    overrides: [
        {
            files: ['*.ts', '*.tsx'],
            rules: {
                '@typescript-eslint/no-shadow': 'warn',
                'no-shadow': 'off',
                'no-undef': 'off',
                'react-hooks/exhaustive-deps': 'warn'
            },
        },
    ],
};
