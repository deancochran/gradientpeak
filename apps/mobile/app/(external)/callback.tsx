import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { parseMobileAuthCallback, refreshMobileAuthSession } from "@/lib/auth/client";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const parsed = parseMobileAuthCallback({
          intent: params.intent,
          token: params.token,
          code: params.code,
          error: params.error,
        });

        if (!parsed.success) {
          router.replace("/(external)/sign-in");
          return;
        }

        const { intent, token, error } = parsed.data;

        if (error) {
          router.replace("/(external)/sign-in");
          return;
        }

        if (intent === "password-reset") {
          router.replace({
            pathname: "/(external)/reset-password",
            params: token ? { token } : undefined,
          });
          return;
        }

        await refreshMobileAuthSession();

        if (intent === "post-sign-in") {
          router.replace("/");
          return;
        }

        router.replace("/(external)/sign-in");
      } catch {
        router.replace("/(external)/sign-in");
      }
    };

    void handleCallback();
  }, [params.code, params.error, params.intent, params.token, router]);

  return (
    <View className="flex-1 bg-background justify-center items-center p-6">
      <ActivityIndicator size="large" className="text-primary mb-4" />
      <Text variant="h3" className="text-center mb-2">
        Completing sign in...
      </Text>
      <Text variant="muted" className="text-center">
        Please wait while we finish your authentication flow
      </Text>
    </View>
  );
}
