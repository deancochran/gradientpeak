import type { StorybookConfig } from "@storybook/react-native";

const config: StorybookConfig = {
  stories: [
    "../../../packages/ui/src/components/**/*.native.stories.@(ts|tsx)",
    "../../../packages/ui/src/storybook/**/*.native.stories.@(ts|tsx)",
  ],
  addons: ["@storybook/addon-ondevice-controls", "@storybook/addon-ondevice-actions"],
};

export default config;
