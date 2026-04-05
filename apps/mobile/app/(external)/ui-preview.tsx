import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { router } from "expo-router";
import type { ComponentType } from "react";
import { View } from "react-native";

export default function UiPreviewScreen() {
  if (!__DEV__) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
        <Text className="text-center text-2xl font-semibold text-foreground">
          Developer route unavailable
        </Text>
        <Text className="max-w-md text-center text-sm text-muted-foreground">
          UI Preview is only available in development builds so production users do not see internal
          component test surfaces.
        </Text>
        <Button variant="outline" onPress={() => router.replace("/")} className="min-w-40">
          <Text>Return to sign in</Text>
        </Button>
      </View>
    );
  }

  const UiPreviewSurface = require("@repo/ui/testing/ui-preview").UiPreviewSurface as ComponentType;

  return <UiPreviewSurface />;
}
