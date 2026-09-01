module.exports = function (api) {
    api.cache(true);
    return {
        presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
        // react-native-worklets/plugin must stay last (Reanimated requirement).
        plugins: ['react-native-worklets/plugin'],
    };
};
