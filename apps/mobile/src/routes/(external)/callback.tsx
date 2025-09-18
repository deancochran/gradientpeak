import { supabase } from "@/lib/supabase";
import { useColorScheme } from "@/lib/providers/ThemeProvider";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { access_token, refresh_token, error, error_description } =
    useLocalSearchParams();
  const { isDarkColorScheme } = useColorScheme();

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
  }, [access_token, refresh_token, error, error_description, router]);

  const backgroundColor = isDarkColorScheme ? "#000000" : "#ffffff";
  const textColor = isDarkColorScheme ? "#ffffff" : "#000000";

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerShown: false,
        }}
      />
      <View style={[styles.container, { backgroundColor }]}>
        <ActivityIndicator size="large" color={textColor} />
        <Text style={[styles.text, { color: textColor }]}>
          Verifying your email...
        </Text>
        <Text style={[styles.subtext, { color: textColor, opacity: 0.6 }]}>
          Please wait while we confirm your account
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  text: {
    marginTop: 24,
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  subtext: {
    marginTop: 8,
    fontSize: 14,
    textAlign: "center",
  },
});
