import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Form, FormTextField } from "@repo/ui/components/form";
import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { type SignInFormValues, signInSchema } from "@/lib/auth/form-schemas";
import { withAuthRequestTimeout } from "@/lib/auth/request-timeout";
import { useAuth } from "@/lib/hooks/useAuth";
import { logMobileAction } from "@/lib/logging/mobile-action-log";
import { parsePostSignInDestination } from "@/lib/navigation/postSignInDestination";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { isServerUrlOverrideEnabled, useServerConfig } from "@/lib/server-config";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function SignInScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const postSignInDestination = parsePostSignInDestination(returnTo);
  const navigateTo = useAppNavigate();
  const { loading: authLoading, user } = useAuth();
  const owner = React.useRef({
    id: user?.id,
    destination: postSignInDestination,
    generation: 0,
    active: true,
  });
  if (owner.current.id !== user?.id || owner.current.destination !== postSignInDestination) {
    owner.current = {
      id: user?.id,
      destination: postSignInDestination,
      generation: owner.current.generation + 1,
      active: true,
    };
  }
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
    schema: signInSchema,
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSignIn = async (data: SignInFormValues) => {
    if (owner.current !== renderOwner || !renderOwner.active) return;
    const current = owner.current;
    const draft = form.getValues();
    let signedInUserId: string | undefined;
    const isCurrent = () =>
      owner.current.active &&
      owner.current.destination === current.destination &&
      ((current.active && owner.current === current) ||
        (current.id === undefined &&
          owner.current.generation === current.generation + 1 &&
          signedInUserId !== undefined &&
          owner.current.id === signedInUserId)) &&
      form.getValues("email") === draft.email &&
      form.getValues("password") === draft.password;
    pending.current = true;
    try {
      await applyPendingAuthServerOverride({
        expanded: isServerConfigExpanded,
        serverUrlInput,
      });

      if (!isCurrent()) return;

      logMobileAction("auth.signIn", "attempt", { email: data.email });

      const result = (await withAuthRequestTimeout(
        authClient.signIn.email({
          email: data.email,
          password: data.password,
        }),
      )) as { error?: { message: string } | null; data?: { user?: { id: string } } };
      // The request's own successful session transition is still this form's completion.
      if (!result.error) signedInUserId = result.data?.user?.id;
      const error = result.error;
      if (!isCurrent()) return;

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
      if (!isCurrent()) return;
      router.replace(postSignInDestination ?? "/(internal)/(tabs)");
    } catch (err) {
      if (!isCurrent()) return;
      logMobileAction("auth.signIn", "failure", {
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

  const handleSignUpPress = () => {
    if (pending.current) return;
    router.replace("/(external)/sign-up");
  };

  const handleForgotPasswordPress = () => {
    if (pending.current) return;
    navigateTo("/(external)/forgot-password");
  };

  const submitForm = useZodFormSubmit({
    form,
    onSubmit: onSignIn,
  });
  const isLoading = authLoading || submitForm.isSubmitting || form.formState.isSubmitting;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
      testID="sign-in-screen"
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center p-5"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Card className="w-full max-w-sm mx-auto bg-card border-border shadow-sm">
          <CardHeader className="items-center gap-2 pb-4">
            <CardTitle className="text-center text-3xl leading-tight">Welcome Back</CardTitle>
            <Text variant="muted" className="text-center text-base leading-6">
              Sign in to continue your fitness journey
            </Text>
          </CardHeader>

          <CardContent className="gap-5">
            <Form {...form}>
              <View className="gap-4" testID="sign-in-form">
                <FormTextField
                  autoCapitalize="none"
                  autoComplete="email"
                  control={form.control}
                  keyboardType="email-address"
                  label="Email"
                  name="email"
                  disabled={isLoading}
                  placeholder="Email address"
                  testId="email-input"
                />

                <FormTextField
                  autoComplete="current-password"
                  control={form.control}
                  label="Password"
                  name="password"
                  disabled={isLoading}
                  placeholder="Password"
                  secureTextEntry
                  testId="password-input"
                />

                {form.formState.errors.root && (
                  <Alert icon={AlertCircle} variant="destructive" testID="root-error-container">
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
              loadingLabel="Signing in..."
              testID="sign-in-button"
              className="w-full"
            >
              <Text>Sign In</Text>
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

            <Button
              variant="link"
              onPress={handleForgotPasswordPress}
              disabled={isLoading}
              testID="forgot-password-button"
              className="w-full"
            >
              <Text className="text-muted-foreground">Forgot your password?</Text>
            </Button>

            <View className="border-t border-border pt-4">
              <Button
                variant="outline"
                onPress={handleSignUpPress}
                disabled={isLoading}
                testID="sign-up-link-button"
                className="w-full"
              >
                <Text>Need an account? Sign up</Text>
              </Button>
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
