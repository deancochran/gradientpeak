import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { UiPreviewSurface } from "@repo/ui/testing/ui-preview";
import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { View } from "react-native";
import { MobileCardPreviewSurface } from "@/components/dev/MobileCardPreviewSurface";

type StorybookModule = {
  default: React.ComponentType;
};

function getDeveloperRoot(surface?: string) {
  if (!__DEV__) {
    return null;
  }

  const developerSurfaceEnabled =
    process.env.EXPO_PUBLIC_MAESTRO_E2E === "1" ||
    process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === "1";

  if (surface === "mobile-cards" && developerSurfaceEnabled) {
    return MobileCardPreviewSurface;
  }

  if (process.env.EXPO_PUBLIC_MAESTRO_E2E === "1") {
    return UiPreviewSurface;
  }

  if (process.env.EXPO_PUBLIC_STORYBOOK_ENABLED !== "1") {
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
  const { surface } = useLocalSearchParams<{ surface?: string }>();
  const DeveloperRoot = React.useMemo(
    () => getDeveloperRoot(Array.isArray(surface) ? surface[0] : surface),
    [surface],
  );

  if (!__DEV__) {
    return (
      <UnavailableRoute
        title="Developer route unavailable"
        description="Storybook is only exposed in development builds so production users do not land in internal tooling surfaces."
      />
    );
  }

  if (!DeveloperRoot) {
    return (
      <UnavailableRoute
        title="Storybook is disabled"
        description="Start the mobile app with `pnpm --filter mobile storybook` and reopen this route to load the on-device component catalog."
      />
    );
  }

  return <DeveloperRoot />;
}
