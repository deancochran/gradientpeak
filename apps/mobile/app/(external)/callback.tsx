import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { getAuthClient } from "@/lib/auth/auth-client";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { error, error_description, token } = params;

  useEffect(() => {
    const handleCallback = async () => {
      try {
        console.log("🔗 Auth callback received:", {
          hasToken: !!token,
          error: error ? String(error) : null,
        });

        if (error) {
          console.error("❌ Auth callback error:", error_description);
          router.replace("/(external)/sign-in");
          return;
        }

        if (typeof token === "string" && token.length > 0) {
          console.log("🔑 Verifying email with Better Auth token...");
          const authClient = getAuthClient();
          const { error: verifyError } = await authClient.verifyEmail({
            query: { token },
          });

          if (verifyError) {
            console.error("❌ Verification error:", verifyError.message);
            router.replace("/(external)/sign-in");
            return;
          }

          await useAuthStore.getState().refreshSession();
          setTimeout(() => {
            router.replace("/" as any);
          }, 500);
        } else {
          console.warn("⚠️ No Better Auth verification token found, redirecting to sign-in");
          router.replace("/(external)/sign-in");
        }
      } catch (err) {
        console.error("💥 Callback handling error:", err);
        router.replace("/(external)/sign-in");
      }
    };

    handleCallback();
  }, [error, error_description, params, router, token]);

  return (
    <View className="flex-1 bg-background justify-center items-center p-6">
      <ActivityIndicator size="large" className="text-primary mb-4" />
      <Text variant="h3" className="text-center mb-2">
        Verifying your email...
      </Text>
      <Text variant="muted" className="text-center">
        Please wait while we confirm your account
      </Text>
    </View>
  );
}
