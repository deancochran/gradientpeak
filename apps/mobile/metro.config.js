const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withStorybook } = require("@storybook/react-native/metro/withStorybook");
const { withNativewind } = require("nativewind/metro");

const isStorybookEnabled =
  process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === "1" && process.env.NODE_ENV !== "production";

/** @type {import('expo/metro-config').MetroConfig} */
const config = withNativewind(getSentryExpoConfig(__dirname), {
  input: "./global.css",
});

module.exports = withStorybook(config, {
  enabled: isStorybookEnabled,
  configPath: "./.rnstorybook",
});
