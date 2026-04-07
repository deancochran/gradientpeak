import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { router } from "expo-router";
import * as React from "react";
import { View } from "react-native";

type StorybookModule = {
  default: React.ComponentType;
};

function getStorybookRoot() {
  if (!__DEV__ || process.env.EXPO_PUBLIC_STORYBOOK_ENABLED !== "1") {
    return null;
  }

  return (require("../../.rnstorybook") as StorybookModule).default;
}

function UnavailableRoute({ title, description }: { title: string; description: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
      <Text className="text-center text-2xl font-semibold text-foreground">{title}</Text>
      <Text className="max-w-md text-center text-sm text-muted-foreground">{description}</Text>
      <Button variant="outline" onPress={() => router.replace("/")} className="min-w-40">
        <Text>Return to sign in</Text>
      </Button>
    </View>
  );
}

export default function StorybookScreen() {
  const StorybookRoot = React.useMemo(() => getStorybookRoot(), []);

  if (!__DEV__) {
    return (
      <UnavailableRoute
        title="Developer route unavailable"
        description="Storybook is only exposed in development builds so production users do not land in internal tooling surfaces."
      />
    );
  }

  if (!StorybookRoot) {
    return (
      <UnavailableRoute
        title="Storybook is disabled"
        description="Start the mobile app with `pnpm --filter mobile storybook` and reopen this route to load the on-device component catalog."
      />
    );
  }

  return <StorybookRoot />;
}
