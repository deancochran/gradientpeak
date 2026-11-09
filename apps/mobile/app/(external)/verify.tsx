import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { authClient, getEmailVerificationCallbackUrl } from "@/lib/auth/client";
import { useAuth } from "@/lib/hooks/useAuth";

export default function VerifyScreen() {
  const router = useRouter();
  const { email, source } = useLocalSearchParams<{ email: string; source?: string }>();
  const { isEmailVerified, user } = useAuth();
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const isSignUpFollowUp = source === "sign-up";
  const context = `${user?.id ?? ""}:${user?.email ?? ""}:${email ?? ""}:${source ?? ""}`;
  const owner = useRef({ context, active: true });
  if (owner.current.context !== context) owner.current = { context, active: true };
  const inFlight = useRef<object | null>(null);
  const renderOwner = owner.current;
  useEffect(() => {
    const current = renderOwner;
    current.active = true;
    setIsResending(false);
    setResendMessage(null);
    inFlight.current = null;
    return () => {
      current.active = false;
    };
  }, [renderOwner]);

  useEffect(() => {
    if (isEmailVerified) {
      router.replace("/");
    }
  }, [isEmailVerified, router]);

  const onResend = async () => {
    if (!email || inFlight.current || owner.current !== renderOwner || !renderOwner.active) return;
    const current = owner.current;
    inFlight.current = current;
    const isCurrent = () => current.active && owner.current === current;

    setIsResending(true);
    setResendMessage(null);
    try {
      await authClient.sendVerificationEmail({
        email,
        callbackURL: getEmailVerificationCallbackUrl(),
      });
    } catch {
      // Delivery failures and identity outcomes share the same public acknowledgement.
    } finally {
      if (isCurrent()) {
        setResendMessage(
          "If this email can be verified, a verification link will be sent. Check your inbox, or try again shortly.",
        );
        setIsResending(false);
        inFlight.current = null;
      }
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
              <LoadingButton
                variant="ghost"
                onPress={onResend}
                disabled={isResending || !email}
                loading={isResending}
                loadingLabel="Sending..."
                loadingTextClassName="text-foreground"
                className="w-full"
                testID="resend-code-button"
              >
                <Text className="text-foreground">Resend Email</Text>
              </LoadingButton>
              <Button
                variant="link"
                disabled={isResending}
                onPress={() => {
                  if (!inFlight.current) router.replace("/(external)/sign-in");
                }}
                className="w-full"
                testID="back-to-sign-in-button"
              >
                <Text>Back to Sign In</Text>
              </Button>
              {resendMessage && (
                <Text
                  className="text-center text-xs text-muted-foreground"
                  testID="resend-message"
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
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
