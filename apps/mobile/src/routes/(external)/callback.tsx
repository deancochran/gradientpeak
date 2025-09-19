import { Text } from "@/components/ui/text";
import { supabase } from "@/lib/supabase/client";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { access_token, refresh_token, error, error_description } =
    useLocalSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        console.log("🔗 Auth callback received:", {
          hasAccessToken: !!access_token,
          hasRefreshToken: !!refresh_token,
          error: error ? String(error) : null,
        });

        if (error) {
          console.error("❌ Auth callback error:", error_description);
          router.replace("/(external)/sign-in");
          return;
        }

        if (access_token && refresh_token) {
          console.log("🔑 Setting session from callback tokens...");
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token: access_token as string,
            refresh_token: refresh_token as string,
          });

          if (sessionError) {
            console.error("❌ Session error:", sessionError.message);
            router.replace("/(external)/sign-in");
            return;
          }

          console.log(
            "✅ Session set successfully, user verified:",
            data.user?.email,
          );

          // Success! User is now verified and signed in
          // Give a brief moment for auth state to propagate
          setTimeout(() => {
            router.replace("/");
          }, 500);
        } else {
          console.warn(
            "⚠️ No tokens found in callback, redirecting to sign-in",
          );
          router.replace("/(external)/sign-in");
        }
      } catch (err) {
        console.error("💥 Callback handling error:", err);
        router.replace("/(external)/sign-in");
      }
    };

    handleCallback();
  }, [access_token, refresh_token, error, error_description, router, supabase]);

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
