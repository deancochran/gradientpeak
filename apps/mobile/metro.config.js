const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

const isStorybookEnabled = process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === "1";

function getWithStorybook() {
  if (!isStorybookEnabled) {
    return (metroConfig) => metroConfig;
  }

  try {
    return require("@storybook/react-native/metro/withStorybook");
  } catch (error) {
    throw new Error(
      "Storybook is enabled, but @storybook/react-native is not available in this install. Run `pnpm install` before starting Storybook.",
      { cause: error },
    );
  }
}

/** @type {import('expo/metro-config').MetroConfig} */
const config = withNativewind(getDefaultConfig(__dirname), {
  input: "./global.css",
});

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

module.exports = getWithStorybook()(config, {
  enabled: isStorybookEnabled,
  configPath: path.resolve(__dirname, ".rnstorybook"),
});
