import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

/**
 * @deprecated Historical deep-link alias. New flows should navigate directly to `/(external)/verify`.
 */
export default function SignUpSuccessScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();

  useEffect(() => {
    router.replace({
      pathname: "/(external)/verify",
      params: { email: email ?? "" },
    });
  }, [router, email]);

  return (
    <View className="flex-1 bg-background justify-center items-center">
      <ActivityIndicator size="large" className="mb-4" />
      <Text>Redirecting to verification...</Text>
    </View>
  );
}
