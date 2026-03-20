import { useRouter } from "expo-router";
import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { ServerUrlOverride } from "@/components/auth/ServerUrlOverride";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  getHostedApiUrl,
  setServerUrlOverride,
  useServerConfig,
} from "@/lib/server-config";
import { useAuthStore } from "@/lib/stores/auth-store";
import { supabase } from "@/lib/supabase/client";

const signInSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z
    .string({ message: "Password is required" })
    .min(8, "Password must be at least 8 characters"),
});

type SignInFields = z.infer<typeof signInSchema>;

const mapSupabaseErrorToFormField = (error: string) => {
  if (error.includes("email") || error.includes("Email")) {
    return "email";
  }
  if (error.includes("password") || error.includes("Password")) {
    return "password";
  }
  return "root";
};

export default function SignInScreen() {
  const router = useRouter();
  const { loading: authLoading } = useAuth();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isServerConfigExpanded, setIsServerConfigExpanded] =
    React.useState(false);
  const serverConfig = useServerConfig();
  const [serverUrlInput, setServerUrlInput] = React.useState(
    serverConfig.overrideUrl ?? serverConfig.apiUrl,
  );

  React.useEffect(() => {
    setServerUrlInput(serverConfig.overrideUrl ?? serverConfig.apiUrl);
  }, [serverConfig.overrideUrl, serverConfig.apiUrl]);

  const form = useForm<SignInFields>({
    resolver: zodResolver(signInSchema),
  });

  const onSignIn = async (data: SignInFields) => {
    setIsSubmitting(true);
    try {
      if (isServerConfigExpanded) {
        const nextUrl = serverUrlInput.trim();
        const hostedApiUrl = getHostedApiUrl();
        const { changed } = await setServerUrlOverride(
          nextUrl.length === 0 || nextUrl === hostedApiUrl ? null : nextUrl,
        );

        if (changed) {
          await useAuthStore.getState().clearSession();
        }
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        console.log("Sign in error:", error.message);
        if (error.message?.includes("Invalid login credentials")) {
          form.setError("root", {
            message: "Invalid email or password. Please try again.",
          });
        } else if (error.message?.includes("Email not confirmed")) {
          router.push({
            pathname: "/(external)/verify",
            params: { email: data.email },
          });
        } else {
          form.setError("root", {
            message: error.message || "An unexpected error occurred",
          });
        }
      }
      // On success, the `onAuthStateChange` listener in the auth store
      // will handle the session and trigger a redirect automatically.
    } catch (err) {
      console.log("Unexpected sign in error:", err);
      form.setError("root", { message: "An unexpected error occurred" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUpPress = () => {
    router.replace("/(external)/sign-up");
  };

  const handleForgotPasswordPress = () => {
    router.push("/(external)/forgot-password");
  };

  const isLoading = authLoading || isSubmitting;

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
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Email address"
                          value={field.value}
                          onChangeText={field.onChange}
                          autoFocus
                          autoCapitalize="none"
                          keyboardType="email-address"
                          autoComplete="email"
                          testID="email-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Password Input */}
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Password"
                          value={field.value}
                          onChangeText={field.onChange}
                          secureTextEntry
                          testID="password-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Root Error */}
                {form.formState.errors.root && (
                  <View
                    className="bg-destructive/15 p-3 rounded-md border border-destructive/25"
                    testID="root-error-container"
                  >
                    <Text
                      variant="small"
                      className="text-destructive text-center"
                    >
                      {form.formState.errors.root.message}
                    </Text>
                  </View>
                )}
              </View>
            </Form>

            {/* Sign In Button */}
            <Button
              variant="default"
              size="lg"
              onPress={form.handleSubmit(onSignIn)}
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
              onToggle={() =>
                setIsServerConfigExpanded((currentValue) => !currentValue)
              }
              onChange={setServerUrlInput}
            />

            {/* Forgot Password Link */}
            <Button
              variant="link"
              onPress={handleForgotPasswordPress}
              testID="forgot-password-button"
              className="w-full"
            >
              <Text className="text-muted-foreground">
                Forgot your password?
              </Text>
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
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
