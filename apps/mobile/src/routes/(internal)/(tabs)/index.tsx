import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/stores/auth-store";
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
      {/* Debug Info */}
      {__DEV__ && (
        <View>
          <Text>Debug Info</Text>
          <Text>Profile ID: {user?.id || "None"}</Text>
          <Text>Profile Username: {user?.email || "None"}</Text>
        </View>
      )}
    </View>
  );
}
