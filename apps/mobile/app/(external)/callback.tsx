import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { parseMobileAuthCallback, refreshMobileAuthSession } from "@/lib/auth/client";

function getSingleParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const hasHandledCallback = useRef(false);
  const normalizedParams = {
    intent: getSingleParam(params.intent),
    token: getSingleParam(params.token),
    code: getSingleParam(params.code),
    error: getSingleParam(params.error),
  };

  useEffect(() => {
    if (hasHandledCallback.current) {
      return;
    }

    hasHandledCallback.current = true;
    let isCancelled = false;

    const handleCallback = async () => {
      try {
        const parsed = parseMobileAuthCallback({
          intent: normalizedParams.intent,
          token: normalizedParams.token,
          code: normalizedParams.code,
          error: normalizedParams.error,
        });

        if (!parsed.success) {
          if (!isCancelled) {
            router.replace("/(external)/sign-in");
          }
          return;
        }

        const { intent, token, error } = parsed.data;

        if (error) {
          if (!isCancelled) {
            router.replace("/(external)/sign-in");
          }
          return;
        }

        if (intent === "password-reset") {
          if (!isCancelled) {
            router.replace({
              pathname: "/(external)/reset-password",
              params: token ? { token } : undefined,
            });
          }
          return;
        }

        await refreshMobileAuthSession();

        if (intent === "post-sign-in") {
          if (!isCancelled) {
            router.replace("/");
          }
          return;
        }

        if (!isCancelled) {
          router.replace("/(external)/sign-in");
        }
      } catch {
        if (!isCancelled) {
          router.replace("/(external)/sign-in");
        }
      }
    };

    void handleCallback();

    return () => {
      isCancelled = true;
    };
  }, [
    normalizedParams.code,
    normalizedParams.error,
    normalizedParams.intent,
    normalizedParams.token,
    router,
  ]);

  return (
    <View className="flex-1 bg-background justify-center items-center p-6">
      <ActivityIndicator size="large" className="text-primary mb-4" />
      <Text variant="h3" className="text-center mb-2">
        Completing authentication…
      </Text>
      <Text variant="muted" className="text-center">
        Please wait while we finish your secure sign-in.
      </Text>
    </View>
  );
}
