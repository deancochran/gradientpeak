import React from "react";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { useUser } from "@/lib/stores";

export default function HomeScreen() {
  const { user } = useUser();

  // TanStack Query hooks

  return (
    <View testID="home-screen">
      {/* Debug Info */}
      {__DEV__ && (
        <View style={styles.debugSection}>
          <Text style={styles.debugTitle}>Debug Info</Text>
          <Text style={styles.debugText}>Profile ID: {user?.id || "None"}</Text>
          <Text style={styles.debugText}>
            Profile Username: {user?.username || "None"}
          </Text>
        </View>
      )}
    </View>
  );
}
