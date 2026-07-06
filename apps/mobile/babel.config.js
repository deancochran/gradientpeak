module.exports = (api) => {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // react-native-worklets/plugin MUST be listed last for Reanimated 4 worklets.
      "react-native-worklets/plugin",
    ],
  };
};
