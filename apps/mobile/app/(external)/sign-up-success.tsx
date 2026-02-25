import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

import { Text } from "@/components/ui/text";

export default function SignUpSuccessScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();

  useEffect(() => {
    // Redirect to the new verify screen immediately
    // This file is deprecated but kept for routing safety
    router.replace({
      pathname: "/(external)/verify",
      params: { email: email || "" },
    });
  }, [router, email]);

  return (
    <View className="flex-1 bg-background justify-center items-center">
      <ActivityIndicator size="large" className="mb-4" />
      <Text>Redirecting to verification...</Text>
    </View>
  );
}
