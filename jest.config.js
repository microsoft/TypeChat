module.exports = {
    displayName: 'typechat',
    transform: {
        '^.+\\.ts?$': [
            'ts-jest',
            {
                isolatedModules: true,
            },
        ],
    },
    testEnvironment: 'node',
    testRegex: '/tests/.*\\.(test|spec)?\\.(ts|tsx)$',
};
