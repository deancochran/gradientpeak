import { Text } from "@repo/ui/components/text";
import * as React from "react";
import { View } from "react-native";

type StorybookModule = {
  default: React.ComponentType;
};

function getStorybookRoot() {
  if (process.env.EXPO_PUBLIC_STORYBOOK_ENABLED !== "1") {
    return null;
  }

  return (require("../../.rnstorybook") as StorybookModule).default;
}

export default function StorybookScreen() {
  const StorybookRoot = React.useMemo(() => getStorybookRoot(), []);

  if (!StorybookRoot) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text className="text-2xl font-semibold text-foreground">Storybook is disabled</Text>
        <Text className="max-w-md text-center text-sm text-muted-foreground">
          Start the mobile app with `pnpm --filter mobile storybook` and reopen this route to load
          the on-device component catalog.
        </Text>
      </View>
    );
  }

  return <StorybookRoot />;
}
