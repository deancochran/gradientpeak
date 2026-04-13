import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Form, FormTextField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { AlertCircle } from "lucide-react-native";
import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { ServerUrlOverride } from "@/components/auth/ServerUrlOverride";
import { authClient, refreshMobileAuthSession } from "@/lib/auth/client";
import {
  applyPendingAuthServerOverride,
  getAuthFormUnexpectedErrorMessage,
  mapSignInError,
  setAuthFormError,
} from "@/lib/auth/form-helpers";
import { type SignInFields, signInSchema } from "@/lib/auth/form-schemas";
import { withAuthRequestTimeout } from "@/lib/auth/request-timeout";
import { useAuth } from "@/lib/hooks/useAuth";
import { logMobileAction } from "@/lib/logging/mobile-action-log";
import { useDedupedPush } from "@/lib/navigation/useDedupedPush";
import { useServerConfig } from "@/lib/server-config";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function SignInScreen() {
  const router = useRouter();
  const pushIfNotCurrent = useDedupedPush();
  const { loading: authLoading } = useAuth();
  const [isServerConfigExpanded, setIsServerConfigExpanded] = React.useState(false);
  const serverConfig = useServerConfig();
  const [serverUrlInput, setServerUrlInput] = React.useState(
    serverConfig.overrideUrl ?? serverConfig.apiUrl,
  );

  React.useEffect(() => {
    setServerUrlInput(serverConfig.overrideUrl ?? serverConfig.apiUrl);
  }, [serverConfig.overrideUrl, serverConfig.apiUrl]);

  const form = useZodForm({
    schema: signInSchema,
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSignIn = async (data: SignInFields) => {
    try {
      await applyPendingAuthServerOverride({
        expanded: isServerConfigExpanded,
        serverUrlInput,
      });

      logMobileAction("auth.signIn", "attempt", { email: data.email });

      const result = (await withAuthRequestTimeout(
        authClient.signIn.email({
          email: data.email,
          password: data.password,
        }),
      )) as { error?: { message: string } | null };
      const error = result.error;

      if (error) {
        logMobileAction("auth.signIn", "failure", { email: data.email, error: error.message });
        const mappedError = mapSignInError(error.message);

        if (mappedError.type === "verify-email") {
          router.replace({
            pathname: "/(external)/verify",
            params: { email: data.email },
          });
          return;
        }

        setAuthFormError(form, mappedError.error);
        return;
      }

      logMobileAction("auth.signIn", "success", { email: data.email });
      await refreshMobileAuthSession();
      await useAuthStore.getState().refreshSession();
      router.replace("/" as any);
    } catch (err) {
      logMobileAction("auth.signIn", "failure", {
        email: data.email,
        error: err instanceof Error ? err.message : String(err),
      });
      setAuthFormError(form, {
        name: "root",
        message: getAuthFormUnexpectedErrorMessage(err),
      });
    }
  };

  const handleSignUpPress = () => {
    router.replace("/(external)/sign-up");
  };

  const handleForgotPasswordPress = () => {
    pushIfNotCurrent("/(external)/forgot-password");
  };

  const submitForm = useZodFormSubmit({
    form,
    onSubmit: onSignIn,
  });
  const isLoading = authLoading || submitForm.isSubmitting;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
      testID="sign-in-screen"
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
                Welcome Back
              </Text>
            </CardTitle>
            <Text variant="muted" className="text-center">
              Sign in to continue your fitness journey
            </Text>
          </CardHeader>

          <CardContent className="gap-6">
            {/* Form */}
            <Form {...form}>
              <View className="gap-4" testID="sign-in-form">
                {/* Email Input */}
                <FormTextField
                  autoCapitalize="none"
                  autoComplete="email"
                  control={form.control}
                  keyboardType="email-address"
                  label="Email"
                  name="email"
                  placeholder="Email address"
                  testId="email-input"
                />

                {/* Password Input */}
                <FormTextField
                  control={form.control}
                  label="Password"
                  name="password"
                  placeholder="Password"
                  secureTextEntry
                  testId="password-input"
                />

                {/* Root Error */}
                {form.formState.errors.root && (
                  <Alert icon={AlertCircle} variant="destructive" testID="root-error-container">
                    <AlertDescription className="text-center">
                      {form.formState.errors.root.message}
                    </AlertDescription>
                  </Alert>
                )}
              </View>
            </Form>

            {/* Sign In Button */}
            <Button
              variant="default"
              size="lg"
              onPress={submitForm.handleSubmit}
              disabled={isLoading}
              testID="sign-in-button"
              className="w-full"
            >
              <Text>{isLoading ? "Signing In..." : "Sign In"}</Text>
            </Button>

            <ServerUrlOverride
              expanded={isServerConfigExpanded}
              value={serverUrlInput}
              usingHostedDefault={!serverConfig.overrideUrl}
              onToggle={() => setIsServerConfigExpanded((currentValue) => !currentValue)}
              onChange={setServerUrlInput}
            />

            {/* Forgot Password Link */}
            <Button
              variant="link"
              onPress={handleForgotPasswordPress}
              testID="forgot-password-button"
              className="w-full"
            >
              <Text className="text-muted-foreground">Forgot your password?</Text>
            </Button>

            {/* Sign Up Link */}
            <View className="border-t border-border pt-4">
              <Button
                variant="outline"
                onPress={handleSignUpPress}
                testID="sign-up-link-button"
                className="w-full"
              >
                <Text>Need an account? Sign up</Text>
              </Button>

              {__DEV__ && (
                <Button
                  variant="ghost"
                  onPress={() => pushIfNotCurrent("/(external)/ui-preview" as any)}
                  testId="open-ui-preview-button"
                  className="mt-3 w-full"
                >
                  <Text>UI Preview</Text>
                </Button>
              )}
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
