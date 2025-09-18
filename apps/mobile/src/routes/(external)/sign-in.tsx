import { Stack, useRouter } from "expo-router";
import React from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Input } from "@/components/ui/input";
import { useColorScheme } from "@/lib/providers/ThemeProvider";
import { useAuth } from "@/lib/stores";

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
  const { isDarkColorScheme } = useColorScheme();
  const { loading, signIn } = useAuth();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Animation refs
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(30)).current;
  const buttonScaleAnim = React.useRef(new Animated.Value(1)).current;
  const signupScaleAnim = React.useRef(new Animated.Value(1)).current;

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignInFields>({
    resolver: zodResolver(signInSchema),
  });

  React.useEffect(() => {
    // Entrance animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const onSignIn = async (data: SignInFields) => {
    // Button press animation
    Animated.sequence([
      Animated.timing(buttonScaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

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
      } else if (authData.user) {
        // Successfully signed in - the auth state change will handle navigation
        console.log("Successfully signed in:", authData.user.email);
      }
    } catch (err) {
      console.log("Unexpected sign in error:", err);
      setError("root", { message: "An unexpected error occurred" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUpPress = () => {
    Animated.sequence([
      Animated.timing(signupScaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(signupScaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      router.replace("/(external)/sign-up");
    });
  };

  const handleForgotPasswordPress = () => {
    router.push("/(external)/forgot-password");
  };

  const backgroundColor = isDarkColorScheme ? "#000000" : "#ffffff";
  const textColor = isDarkColorScheme ? "#ffffff" : "#000000";
  const subtleColor = isDarkColorScheme ? "#666666" : "#999999";
  const borderColor = isDarkColorScheme ? "#333333" : "#e5e5e5";
  const errorColor = isDarkColorScheme ? "#ff6b6b" : "#dc3545";

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerStyle: {
            backgroundColor,
          },
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.container, { backgroundColor }]}
        testID="sign-in-screen"
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.content,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
            testID="sign-in-content"
          >
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
            <Animated.View
              style={[
                styles.buttonContainer,
                { transform: [{ scale: buttonScaleAnim }] },
              ]}
              testID="sign-in-button-container"
            >
              <TouchableOpacity
                onPress={handleSubmit(onSignIn)}
                disabled={loading || isSubmitting}
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor: textColor,
                    opacity: loading || isSubmitting ? 0.7 : 1,
                  },
                ]}
                testID="sign-in-button"
              >
                <Text
                  style={[styles.primaryButtonText, { color: backgroundColor }]}
                  testID="sign-in-button-text"
                >
                  {loading ? "Signing In..." : "Sign In"}
                </Text>
              </TouchableOpacity>
            </Animated.View>

            {/* Forgot Password Link */}
            <View
              style={styles.forgotPasswordContainer}
              testID="forgot-password-container"
            >
              <TouchableOpacity
                onPress={handleForgotPasswordPress}
                testID="forgot-password-button"
              >
                <Text
                  style={[styles.forgotPasswordText, { color: subtleColor }]}
                  testID="forgot-password-text"
                >
                  Forgot your password?
                </Text>
              </TouchableOpacity>
            </View>

            {/* Sign Up Link */}
            <Animated.View
              style={[
                styles.linkContainer,
                { transform: [{ scale: signupScaleAnim }] },
              ]}
              testID="sign-up-link-container"
            >
              <TouchableOpacity
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
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  content: {
    width: "100%",
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    fontWeight: "400",
  },
  form: {
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 20,
  },
  input: {
    height: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 20,
    fontSize: 16,
    fontWeight: "500",
  },
  errorText: {
    fontSize: 14,
    marginTop: 8,
    fontWeight: "500",
  },
  rootErrorContainer: {
    marginTop: 8,
    marginBottom: 8,
  },
  buttonContainer: {
    marginBottom: 20,
  },
  primaryButton: {
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  forgotPasswordContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  forgotPasswordText: {
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
  },
  linkContainer: {
    alignItems: "center",
  },
  secondaryButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
});
