import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { getAuthClient } from "@/lib/auth/auth-client";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function VerifyScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const { isEmailVerified } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  // Auto-redirect when email becomes verified (via email link or background refresh)
  useEffect(() => {
    if (isEmailVerified) {
      console.log("✅ Email verified, redirecting to app...");
      router.replace("/");
    }
  }, [isEmailVerified, router]);

  // Auto-Polling for external verification (e.g. desktop link click)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const authClient = getAuthClient();
        const { data, error } = await authClient.getSession();

        if (!error && data?.user?.emailVerified) {
          console.log("✅ Email verified via external link, refreshing session...");
          await useAuthStore.getState().refreshSession();
        }
      } catch (error) {
        console.warn("Failed to refresh verification state", error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const refreshVerificationState = async () => {
    if (!email) {
      setResendMessage("Email not found. Please try signing up again.");
      return;
    }

    setIsRefreshing(true);
    setResendMessage(null);
    try {
      const authClient = getAuthClient();
      const { data, error } = await authClient.getSession();

      if (error) {
        setResendMessage(error.message || "Unable to refresh your verification status.");
        return;
      }

      if (data?.user?.emailVerified) {
        await useAuthStore.getState().refreshSession();
      } else {
        setResendMessage(
          "We have not seen a verified session yet. Open the email link, then try again.",
        );
      }
    } catch (err) {
      console.log("Unexpected verify refresh error:", err);
      setResendMessage("An unexpected error occurred");
    } finally {
      setIsRefreshing(false);
    }
  };

  const onResend = async () => {
    if (!email) return;

    setIsResending(true);
    setResendMessage(null);
    try {
      const authClient = getAuthClient();
      const { error } = await authClient.sendVerificationEmail({
        email,
        callbackURL: Linking.createURL("/(external)/verification-success"),
      });

      if (error) {
        setResendMessage(error.message || "Failed to resend email");
      } else {
        setResendMessage("Verification email sent!");
      }
    } catch (err) {
      setResendMessage("Failed to resend email");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
      testID="verify-screen"
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center p-6"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Card className="w-full max-w-sm mx-auto bg-card border-border shadow-sm">
          <CardHeader className="items-center pb-6">
            <CardTitle>
              <Text variant="h2" className="text-center">
                Verify Email
              </Text>
            </CardTitle>
            <Text variant="muted" className="text-center">
              Open the verification link sent to {email || "your email"}, then come back here.
            </Text>
          </CardHeader>

          <CardContent className="gap-6">
            <View className="gap-4">
              <Text variant="muted" className="text-center text-sm">
                You can confirm the link from this device or another one. We&apos;ll refresh your
                account as soon as the verification completes.
              </Text>

              <Button
                onPress={refreshVerificationState}
                disabled={isRefreshing}
                className="w-full"
                size="lg"
                testID="verify-button"
              >
                <Text>{isRefreshing ? "Checking..." : "I&apos;ve Verified My Email"}</Text>
              </Button>

              {resendMessage && (
                <Alert
                  icon={AlertCircle}
                  variant={resendMessage.includes("sent") ? "default" : "destructive"}
                >
                  <AlertDescription className="text-center" testID="resend-message">
                    {resendMessage}
                  </AlertDescription>
                </Alert>
              )}
            </View>

            <View className="gap-2 pt-2">
              <Button
                variant="ghost"
                onPress={onResend}
                disabled={isResending}
                className="w-full"
                testID="resend-code-button"
              >
                <Text>{isResending ? "Sending..." : "Resend Email"}</Text>
              </Button>
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
