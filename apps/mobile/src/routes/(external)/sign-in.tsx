import { useRouter } from "expo-router";
import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";

const signInSchema = z.object({
  email: z.email("Invalid email address"),
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
  const { loading, signIn } = useAuth();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignInFields>({
    resolver: zodResolver(signInSchema),
  });

  const onSignIn = async (data: SignInFields) => {
    // Button press animation

    setIsSubmitting(true);
    try {
      const { error } = await signIn(data.email, data.password);

      if (error) {
        console.log("Sign in error:", error);

        // Handle specific Supabase auth errors
        if (error.message?.includes("Invalid login credentials")) {
          setError("root", {
            message: "Invalid email or password. Please try again.",
          });
        } else if (error.message?.includes("Email not confirmed")) {
          setError("root", {
            message:
              "Please verify your email address before signing in. Check your email for a verification link.",
          });
        } else if (error.message?.includes("Too many requests")) {
          setError("root", {
            message: "Too many login attempts. Please try again later.",
          });
        } else {
          const fieldName = mapSupabaseErrorToFormField(error.message || "");
          setError(fieldName, {
            message: error.message || "An unexpected error occurred",
          });
        }
      } else {
        // Successfully signed in - the auth state change will handle navigation
        console.log("Successfully signed in");
      }
    } catch (err) {
      console.log("Unexpected sign in error:", err);
      setError("root", { message: "An unexpected error occurred" });
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

  return (
    <>
      <Slot />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.container]}
        testID="sign-in-screen"
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.content]} testID="sign-in-content">
            {/* Header */}
            <View style={styles.header} testID="sign-in-header">
              <Text
                style={[styles.title, { color: textColor }]}
                testID="sign-in-title"
              >
                Welcome Back
              </Text>
              <Text
                style={[styles.subtitle, { color: subtleColor }]}
                testID="sign-in-subtitle"
              >
                Sign in to continue your fitness journey
              </Text>
            </View>

            {/* Form */}
            <View style={styles.form} testID="sign-in-form">
              <View style={styles.inputContainer}>
                <Controller
                  control={control}
                  name="email"
                  render={({ field: { onChange, value } }) => (
                    <Input
                      placeholder="Email address"
                      value={value}
                      onChangeText={onChange}
                      autoFocus
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoComplete="email"
                      style={[
                        styles.input,
                        {
                          borderColor: errors.email ? errorColor : borderColor,
                          color: textColor,
                        },
                      ]}
                      testID="email-input"
                    />
                  )}
                />
                {errors.email && (
                  <Text
                    style={[styles.errorText, { color: errorColor }]}
                    testID="email-error"
                  >
                    {errors.email.message}
                  </Text>
                )}
              </View>

              <View style={styles.inputContainer}>
                <Controller
                  control={control}
                  name="password"
                  render={({ field: { onChange, value } }) => (
                    <Input
                      placeholder="Password"
                      value={value}
                      onChangeText={onChange}
                      secureTextEntry
                      style={[
                        styles.input,
                        {
                          borderColor: errors.password
                            ? errorColor
                            : borderColor,
                          color: textColor,
                        },
                      ]}
                      testID="password-input"
                    />
                  )}
                />
                {errors.password && (
                  <Text
                    style={[styles.errorText, { color: errorColor }]}
                    testID="password-error"
                  >
                    {errors.password.message}
                  </Text>
                )}
              </View>

              {errors.root && (
                <View
                  style={styles.rootErrorContainer}
                  testID="root-error-container"
                >
                  <Text
                    style={[
                      styles.errorText,
                      { color: errorColor, textAlign: "center" },
                    ]}
                    testID="form-error"
                  >
                    {errors.root.message}
                  </Text>
                </View>
              )}
            </View>

            {/* Sign In Button */}
            <View
              style={[
                styles.buttonContainer,
                { transform: [{ scale: buttonScaleAnim }] },
              ]}
              testID="sign-in-button-container"
            >
              <Button
                onPress={handleSubmit(onSignIn)}
                disabled={isLoading || isSubmitting}
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor: textColor,
                    opacity: isLoading || isSubmitting ? 0.7 : 1,
                  },
                ]}
                testID="sign-in-button"
              >
                <Text
                  style={[styles.primaryButtonText, { color: backgroundColor }]}
                  testID="sign-in-button-text"
                >
                  {isLoading ? "Signing In..." : "Sign In"}
                </Text>
              </Button>
            </View>

            {/* Forgot Password Link */}
            <View
              style={styles.forgotPasswordContainer}
              testID="forgot-password-container"
            >
              <Button
                onPress={handleForgotPasswordPress}
                testID="forgot-password-button"
              >
                <Text
                  style={[styles.forgotPasswordText, { color: subtleColor }]}
                  testID="forgot-password-text"
                >
                  Forgot your password?
                </Text>
              </Button>
            </View>

            {/* Sign Up Link */}
            <View
              style={[
                styles.linkContainer,
                { transform: [{ scale: signupScaleAnim }] },
              ]}
              testID="sign-up-link-container"
            >
              <Button
                onPress={handleSignUpPress}
                style={[styles.secondaryButton, { borderColor }]}
                testID="sign-up-link-button"
              >
                <Text
                  style={[styles.secondaryButtonText, { color: textColor }]}
                  testID="sign-up-link-text"
                >
                  Don&apos;t have an account? Sign up
                </Text>
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
