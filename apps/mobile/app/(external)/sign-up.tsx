import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Form, FormTextField } from "@repo/ui/components/form";
import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { useRouter } from "expo-router";
import { AlertCircle } from "lucide-react-native";
import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { ServerUrlOverride } from "@/components/auth/ServerUrlOverride";
import {
  authClient,
  getEmailVerificationCallbackUrl,
  refreshMobileAuthSession,
} from "@/lib/auth/client";
import {
  applyPendingAuthServerOverride,
  getAuthFormUnexpectedErrorMessage,
  mapSignUpError,
  setAuthFormError,
} from "@/lib/auth/form-helpers";
import {
  getDisplayNameFromEmail,
  type SignUpFormValues,
  signUpFormSchema,
} from "@/lib/auth/form-schemas";
import { withAuthRequestTimeout } from "@/lib/auth/request-timeout";
import { useAuth } from "@/lib/hooks/useAuth";
import { logMobileAction } from "@/lib/logging/mobile-action-log";
import { isServerUrlOverrideEnabled, useServerConfig } from "@/lib/server-config";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function SignUpScreen() {
  const router = useRouter();
  const { loading: authLoading, user } = useAuth();
  const owner = React.useRef({ id: user?.id, generation: 0, active: true });
  if (owner.current.id !== user?.id)
    owner.current = { id: user?.id, generation: owner.current.generation + 1, active: true };
  const pending = React.useRef(false);
  const renderOwner = owner.current;
  React.useEffect(() => {
    const current = renderOwner;
    current.active = true;
    return () => {
      current.active = false;
    };
  }, [renderOwner]);
  const [isServerConfigExpanded, setIsServerConfigExpanded] = React.useState(false);
  const serverOverrideEnabled = isServerUrlOverrideEnabled();
  const serverConfig = useServerConfig();
  const [serverUrlInput, setServerUrlInput] = React.useState(
    serverConfig.overrideUrl ?? serverConfig.apiUrl,
  );

  React.useEffect(() => {
    setServerUrlInput(serverConfig.overrideUrl ?? serverConfig.apiUrl);
  }, [serverConfig.overrideUrl, serverConfig.apiUrl]);

  const form = useZodForm({
    schema: signUpFormSchema,
    defaultValues: {
      email: "",
      password: "",
      repeatPassword: "",
    },
  });

  const onSignUp = async (data: SignUpFormValues) => {
    if (owner.current !== renderOwner || !renderOwner.active) return;
    const current = owner.current;
    const draft = form.getValues();
    let signedUpUserId: string | undefined;
    const isCurrent = () =>
      owner.current.active &&
      ((current.active && owner.current === current) ||
        (current.id === undefined &&
          owner.current.generation === current.generation + 1 &&
          signedUpUserId !== undefined &&
          owner.current.id === signedUpUserId)) &&
      form.getValues("email") === draft.email &&
      form.getValues("password") === draft.password &&
      form.getValues("repeatPassword") === draft.repeatPassword;
    pending.current = true;
    try {
      await applyPendingAuthServerOverride({
        expanded: serverOverrideEnabled && isServerConfigExpanded,
        serverUrlInput,
      });

      if (!isCurrent()) return;

      logMobileAction("auth.signUp", "attempt", { email: data.email });

      const result = (await withAuthRequestTimeout(
        authClient.signUp.email({
          email: data.email,
          password: data.password,
          name: getDisplayNameFromEmail(data.email),
          callbackURL: getEmailVerificationCallbackUrl(),
        }),
      )) as { error?: { message: string } | null; data?: { user?: { id: string } } };
      if (!result.error) signedUpUserId = result.data?.user?.id;
      const error = result.error;
      if (!isCurrent()) return;

      if (error) {
        logMobileAction("auth.signUp", "failure", { email: data.email, error: error.message });
        setAuthFormError(form, mapSignUpError(error.message));
      } else {
        logMobileAction("auth.signUp", "success", { email: data.email });

        const session = await refreshMobileAuthSession();
        await useAuthStore.getState().refreshSession();
        if (!isCurrent()) return;

        if (session?.user.emailVerified) {
          router.replace("/");
          return;
        }

        router.replace({
          pathname: "/(external)/verify",
          params: { email: data.email, source: "sign-up" },
        });
      }
    } catch (err) {
      if (!isCurrent()) return;
      logMobileAction("auth.signUp", "failure", {
        email: data.email,
        error: err instanceof Error ? err.message : String(err),
      });
      setAuthFormError(form, {
        name: "root",
        message: getAuthFormUnexpectedErrorMessage(err),
      });
    } finally {
      pending.current = false;
    }
  };

  const handleSignInPress = () => {
    if (pending.current) return;
    router.replace("/(external)/sign-in");
  };

  const submitForm = useZodFormSubmit({
    form,
    onSubmit: onSignUp,
  });
  const isLoading = authLoading || submitForm.isSubmitting || form.formState.isSubmitting;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
      testID="sign-up-screen"
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center p-5"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Card className="w-full max-w-sm mx-auto bg-card border-border shadow-sm">
          <CardHeader className="items-center gap-2 pb-4">
            <CardTitle className="text-center text-3xl leading-tight">Create Account</CardTitle>
            <Text variant="muted" className="text-center text-base leading-6">
              Start tracking your fitness progress today
            </Text>
          </CardHeader>

          <CardContent className="gap-5">
            <Form {...form}>
              <View className="gap-4" testID="sign-up-form">
                <FormTextField
                  control={form.control}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  label="Email"
                  name="email"
                  disabled={isLoading}
                  placeholder="m@example.com"
                  testId="email-input"
                />

                <FormTextField
                  autoComplete="new-password"
                  control={form.control}
                  label="Password"
                  name="password"
                  disabled={isLoading}
                  placeholder="Enter your password"
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
                  label="Repeat Password"
                  name="repeatPassword"
                  disabled={isLoading}
                  placeholder="Confirm your password"
                  secureTextEntry
                  testId="repeat-password-input"
                />

                {form.formState.errors.root && (
                  <Alert icon={AlertCircle} variant="destructive" testID="form-error">
                    <AlertDescription className="text-center">
                      {form.formState.errors.root.message}
                    </AlertDescription>
                  </Alert>
                )}
              </View>
            </Form>

            <LoadingButton
              variant="default"
              size="lg"
              onPress={() => {
                if (pending.current) return;
                pending.current = true;
                return submitForm.handleSubmit().finally(() => {
                  pending.current = false;
                });
              }}
              disabled={isLoading}
              loading={isLoading}
              loadingLabel="Creating account..."
              testID="sign-up-button"
              className="w-full"
            >
              <Text>Create Account</Text>
            </LoadingButton>

            {serverOverrideEnabled ? (
              <ServerUrlOverride
                expanded={isServerConfigExpanded}
                value={serverUrlInput}
                usingHostedDefault={!serverConfig.overrideUrl}
                onToggle={() => setIsServerConfigExpanded((currentValue) => !currentValue)}
                onChange={setServerUrlInput}
              />
            ) : null}

            <View className="border-t border-border pt-4">
              <Button
                variant="outline"
                onPress={handleSignInPress}
                disabled={isLoading}
                testID="sign-in-link-button"
                className="w-full"
              >
                <Text>Already have an account? Sign in</Text>
              </Button>
            </View>

            <View className="pt-4" testID="terms-container">
              <Text variant="muted" className="text-center text-xs" testID="terms-text">
                By creating an account, you agree to our{"\n"}Terms of Service and Privacy Policy
              </Text>
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
