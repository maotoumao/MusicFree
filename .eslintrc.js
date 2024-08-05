module.exports = {
    root: true,
    extends: '@react-native',
    overrides: [
        {
            files: ['*.ts', '*.tsx'],
            rules: {
                '@typescript-eslint/no-shadow': 'warn',
                'no-shadow': 'off',
                'no-undef': 'off',
                'prettier/prettier': 'error',
                'react-hooks/exhaustive-deps': 'warn',
            },
        },
    ],
};
