import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { authClient, getEmailVerificationCallbackUrl } from "@/lib/auth/client";
import { useAuth } from "@/lib/hooks/useAuth";

export default function VerifyScreen() {
  const router = useRouter();
  const { email, source } = useLocalSearchParams<{ email: string; source?: string }>();
  const { isEmailVerified } = useAuth();
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const isSignUpFollowUp = source === "sign-up";

  useEffect(() => {
    if (isEmailVerified) {
      router.replace("/");
    }
  }, [isEmailVerified, router]);

  const onResend = async () => {
    if (!email) return;

    setIsResending(true);
    setResendMessage(null);
    try {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: getEmailVerificationCallbackUrl(),
      });

      if (result.error) {
        setResendMessage(result.error.message || "Failed to resend verification email");
      } else {
        setResendMessage(
          "Verification email request accepted. Refresh your inbox or Mailpit and try again in a few seconds.",
        );
      }
    } catch {
      setResendMessage("Failed to resend verification email");
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
              {isSignUpFollowUp
                ? `Check your inbox for a verification link for ${email || "your email"}. If this account already existed but is still awaiting verification, the same link flow applies.`
                : `Check your inbox for a verification link sent to ${email || "your email"}`}
            </Text>
          </CardHeader>

          <CardContent className="gap-6">
            <Alert icon={AlertCircle}>
              <AlertDescription className="text-center">
                Open the verification email on this device. If you do not see it yet, use resend
                below and then check your inbox or Mailpit again after a short delay. If you already
                verified this account, go back and sign in instead.
              </AlertDescription>
            </Alert>

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
              <Button
                variant="link"
                onPress={() => router.replace("/(external)/sign-in")}
                className="w-full"
                testID="back-to-sign-in-button"
              >
                <Text>Back to Sign In</Text>
              </Button>
              {resendMessage && (
                <Text
                  className={`text-center text-xs ${
                    resendMessage.startsWith("Failed") ? "text-destructive" : "text-success"
                  }`}
                  testID="resend-message"
                >
                  {resendMessage}
                </Text>
              )}
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
