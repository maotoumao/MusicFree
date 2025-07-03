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
                'react-hooks/exhaustive-deps': 'warn',
                '@typescript-eslint/object-curly-spacing': ['error', 'always'],
                "quotes": ["warn", "double"],
                "object-curly-spacing": ["error", "always"],
                "indent": ["error", 4],
                "semi": ["error", "always"],
                "comma-dangle": ["error", "always-multiline"], 
                "brace-style": ["error", "1tbs"], 
            },
        },
    ],
};
