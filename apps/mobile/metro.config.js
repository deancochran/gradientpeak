const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const withStorybook = require("@storybook/react-native/metro/withStorybook");
const { withNativewind } = require("nativewind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = withNativewind(getDefaultConfig(__dirname));

const existingResolveRequest = config.resolver?.resolveRequest;

config.resolver = {
  ...config.resolver,
  resolveRequest(context, moduleName, platform) {
    if (
      moduleName === "tty" ||
      moduleName === "node:tty" ||
      moduleName === "os" ||
      moduleName === "node:os"
    ) {
      return {
        type: "empty",
      };
    }

    const resolve = existingResolveRequest ?? context.resolveRequest;
    return resolve(context, moduleName, platform);
  },
};

module.exports = withStorybook(config, {
  enabled: process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === "1",
  configPath: path.resolve(__dirname, ".rnstorybook"),
});
