import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../../../packages/ui/src/**/!(*.native).stories.@(ts|tsx)"],
  addons: ["@storybook/addon-themes"],
  framework: "@storybook/react-vite",
  core: {
    builder: {
      name: "@storybook/builder-vite",
      options: {
        viteConfigPath: fileURLToPath(new URL("./vite.config.ts", import.meta.url)),
      },
    },
  },
};

export default config;
