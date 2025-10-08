// app/(tabs)/record-launcher.tsx

import { Text } from "@/components/ui/text";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

export default function RecordLauncher() {
  const router = useRouter();

  useEffect(() => {
    // 🚀 Immediately push to the actual modal route
    // This route is defined by the record/_layout.tsx file below
    router.push("/record");
  }, [router]);

  // Render a brief loading state while the redirection occurs
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text>Launching Recorder...</Text>
    </View>
  );
}
