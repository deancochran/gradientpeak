import { AlertDescription, Alert as UiAlert } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Form, FormTextField } from "@repo/ui/components/form";
import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { authClient, signOutMobileAuth } from "@/lib/auth/client";
import {
  getAuthFormUnexpectedErrorMessage,
  mapResetPasswordError,
  setAuthFormError,
} from "@/lib/auth/form-helpers";
import { type UpdatePasswordFormValues, updatePasswordFormSchema } from "@/lib/auth/form-schemas";
import { withAuthRequestTimeout } from "@/lib/auth/request-timeout";
import { logMobileAction } from "@/lib/logging/mobile-action-log";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [rejectedToken, setRejectedToken] = useState<string | null>(null);
  const invalidToken = !token || token === rejectedToken;
  const owner = useRef({ token, active: true });
  if (owner.current.token !== token) owner.current = { token, active: true };
  const renderOwner = owner.current;

  const form = useZodForm({
    schema: updatePasswordFormSchema,
    defaultValues: {
      confirmPassword: "",
      password: "",
    },
  });

  useEffect(() => {
    const current = renderOwner;
    current.active = true;
    form.reset({ password: "", confirmPassword: "" });
    return () => {
      current.active = false;
    };
  }, [form, renderOwner]);

  const onUpdatePassword = async (data: UpdatePasswordFormValues) => {
    if (owner.current !== renderOwner || !renderOwner.active) return;
    const current = owner.current;
    const isCurrent = () =>
      current.active &&
      owner.current === current &&
      form.getValues("password") === data.password &&
      form.getValues("confirmPassword") === data.confirmPassword;
    if (invalidToken) {
      form.setError("root", {
        message: "Reset token not found. Please request a new reset email.",
      });
      return;
    }

    try {
      logMobileAction("auth.updatePassword", "attempt", {});
      const result = (await withAuthRequestTimeout(
        authClient.resetPassword({
          newPassword: data.password,
          token: String(token),
        }),
      )) as { error?: { message: string } | null };
      if (!isCurrent()) return;

      if (result.error) {
        if (
          /invalid.*token|token.*(?:invalid|expired)|expired.*token/i.test(result.error.message)
        ) {
          setRejectedToken(token ?? null);
        }
        logMobileAction("auth.updatePassword", "failure", { error: result.error.message });
        setAuthFormError(form, mapResetPasswordError(result.error.message));
        return;
      }

      logMobileAction("auth.updatePassword", "success", {});

      await signOutMobileAuth().catch(() => {});
      await useAuthStore.getState().clearSession();
      if (!isCurrent()) return;
      form.reset({ password: "", confirmPassword: "" });

      Alert.alert(
        "Password Updated",
        "Your password has been changed. Please sign in with your new credentials.",
        [
          {
            text: "OK",
            onPress: () => {
              if (current.active && owner.current === current)
                router.replace("/(external)/sign-in");
            },
          },
        ],
      );
    } catch (err) {
      if (!isCurrent()) return;
      logMobileAction("auth.updatePassword", "failure", {
        error: err instanceof Error ? err.message : String(err),
      });
      setAuthFormError(form, {
        name: "root",
        message: getAuthFormUnexpectedErrorMessage(err),
      });
    }
  };

  const submitForm = useZodFormSubmit({
    form,
    onSubmit: onUpdatePassword,
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
      testID="reset-password-screen"
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
                Set New Password
              </Text>
            </CardTitle>
            <Text variant="muted" className="text-center">
              Please enter your new password below
            </Text>
          </CardHeader>

          <CardContent className="gap-6">
            {invalidToken ? (
              <View className="gap-2">
                <Text accessibilityRole="alert" accessibilityLiveRegion="polite">
                  This password reset link is missing or invalid. Request a new link to continue.
                </Text>
                <Button
                  onPress={() => router.replace("/(external)/forgot-password")}
                  testID="request-reset-link-button"
                >
                  <Text>Request a new reset link</Text>
                </Button>
              </View>
            ) : null}
            <Form {...form}>
              <View className="gap-4" testID="reset-password-form">
                <FormTextField
                  autoComplete="new-password"
                  control={form.control}
                  label="New Password"
                  name="password"
                  disabled={submitForm.isSubmitting || invalidToken}
                  placeholder="Enter new password"
                  secureTextEntry
                  testId="password-input"
                />

                <View className="mt-2 gap-1" testID="password-hints">
                  <Text variant="muted" className="text-xs">
                    Password must contain:
                  </Text>
                  <Text variant="muted" className="text-xs">
                    • At least 8 characters
                  </Text>
                  <Text variant="muted" className="text-xs">
                    • One uppercase letter
                  </Text>
                  <Text variant="muted" className="text-xs">
                    • One number
                  </Text>
                </View>

                <FormTextField
                  autoComplete="new-password"
                  control={form.control}
                  label="Confirm Password"
                  name="confirmPassword"
                  disabled={submitForm.isSubmitting || invalidToken}
                  placeholder="Confirm new password"
                  secureTextEntry
                  testId="confirm-password-input"
                />

                {form.formState.errors.root && (
                  <UiAlert icon={AlertCircle} variant="destructive" testID="form-error">
                    <AlertDescription className="text-center">
                      {form.formState.errors.root.message}
                    </AlertDescription>
                  </UiAlert>
                )}
              </View>
            </Form>

            <LoadingButton
              variant="default"
              size="lg"
              onPress={submitForm.handleSubmit}
              disabled={submitForm.isSubmitting || invalidToken}
              loading={submitForm.isSubmitting}
              loadingLabel="Updating password..."
              testID="update-password-button"
              className="w-full"
            >
              <Text>Update Password</Text>
            </LoadingButton>

            <View className="pt-4" testID="help-container">
              <Text variant="muted" className="text-center text-xs">
                After updating your password, you will need to sign in again.
              </Text>
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
