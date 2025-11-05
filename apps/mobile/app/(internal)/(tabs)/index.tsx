import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";
import React from "react";
import { View } from "react-native";

export default function HomeScreen() {
  const { user } = useAuth();

  return (
    <View
      testID="home-screen"
      className="flex-1 bg-background h-full items-center justify-center"
    >
      <Text className="text-2xl font-bold">Home Screen</Text>

      {/* NativeWind Test */}
      {__DEV__ && (
        <View className="mt-8 p-4 bg-primary rounded-lg">
          <Text className="text-primary-foreground font-bold">
            NativeWind Test
          </Text>
          <Text className="text-primary-foreground mt-2">
            If you see this with a colored background, styles are working!
          </Text>
        </View>
      )}

      {/* Debug Info */}
      {__DEV__ && (
        <View className="mt-4">
          <Text>Debug Info</Text>
          <Text>Profile ID: {user?.id || "None"}</Text>
          <Text>Profile Username: {user?.email || "None"}</Text>
        </View>
      )}
    </View>
  );
}
