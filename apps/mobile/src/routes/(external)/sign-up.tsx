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
import { Stack, useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Input } from "@/components/ui/input";
import { useColorScheme } from "@/lib/providers/ThemeProvider";
import { useAuth } from "@/lib/stores";

const signUpSchema = z
  .object({
    email: z.email("Invalid email address"),
    password: z
      .string({ message: "Password is required" })
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    repeatPassword: z.string({ message: "Please confirm your password" }),
  })
  .refine((data) => data.password === data.repeatPassword, {
    message: "Passwords do not match",
    path: ["repeatPassword"],
  });

type SignUpFields = z.infer<typeof signUpSchema>;

const mapSupabaseErrorToFormField = (error: string) => {
  if (error.includes("email") || error.includes("Email")) {
    return "email";
  }
  if (error.includes("password") || error.includes("Password")) {
    return "password";
  }
  return "root";
};

export default function SignUpScreen() {
  const router = useRouter();
  const { isDarkColorScheme } = useColorScheme();
  const { loading, signUp } = useAuth();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Animation refs
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(30)).current;
  const buttonScaleAnim = React.useRef(new Animated.Value(1)).current;
  const signinScaleAnim = React.useRef(new Animated.Value(1)).current;

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignUpFields>({
    resolver: zodResolver(signUpSchema),
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

  const onSignUp = async (data: SignUpFields) => {
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
      const { error } = await signUp(data.email, data.password);

      if (error) {
        console.log("Sign up error:", error);

        // Handle specific auth errors
        if (error.message?.includes("User already registered")) {
          setError("email", {
            message: "An account with this email already exists",
          });
        } else if (error.message?.includes("Password should be")) {
          setError("password", {
            message: error.message,
          });
        } else if (error.message?.includes("Unable to validate email")) {
          setError("email", {
            message: "Please enter a valid email address",
          });
        } else {
          const fieldName = mapSupabaseErrorToFormField(error.message || "");
          setError(fieldName, {
            message: error.message || "An unexpected error occurred",
          });
        }
      } else {
        // Successfully signed up - show verification message
        console.log("Successfully signed up:", data.email);
        router.push("/(external)/verify");
      }
    } catch (err) {
      console.log("Unexpected sign up error:", err);
      setError("root", { message: "An unexpected error occurred" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignInPress = () => {
    Animated.sequence([
      Animated.timing(signinScaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(signinScaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      router.replace("/(external)/sign-in");
    });
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
        testID="sign-up-screen"
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
            testID="sign-up-content"
          >
            {/* Header */}
            <View style={styles.header} testID="sign-up-header">
              <Text
                style={[styles.title, { color: textColor }]}
                testID="sign-up-title"
              >
                Create Account
              </Text>
              <Text
                style={[styles.subtitle, { color: subtleColor }]}
                testID="sign-up-subtitle"
              >
                Start tracking your fitness progress today
              </Text>
            </View>

            {/* Form */}
            <View style={styles.form} testID="sign-up-form">
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: textColor }]}>Email</Text>
                <Controller
                  control={control}
                  name="email"
                  render={({ field: { onChange, value } }) => (
                    <Input
                      placeholder="m@example.com"
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
                <Text style={[styles.label, { color: textColor }]}>
                  Password
                </Text>
                <Controller
                  control={control}
                  name="password"
                  render={({ field: { onChange, value } }) => (
                    <Input
                      placeholder="Enter your password"
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

                {/* Password Requirements */}
                <View style={styles.passwordHints} testID="password-hints">
                  <Text style={[styles.hintText, { color: subtleColor }]}>
                    Password must contain:
                  </Text>
                  <Text style={[styles.hintText, { color: subtleColor }]}>
                    • At least 8 characters
                  </Text>
                  <Text style={[styles.hintText, { color: subtleColor }]}>
                    • One uppercase letter
                  </Text>
                  <Text style={[styles.hintText, { color: subtleColor }]}>
                    • One number
                  </Text>
                </View>
              </View>

              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: textColor }]}>
                  Repeat Password
                </Text>
                <Controller
                  control={control}
                  name="repeatPassword"
                  render={({ field: { onChange, value } }) => (
                    <Input
                      placeholder="Confirm your password"
                      value={value}
                      onChangeText={onChange}
                      secureTextEntry
                      style={[
                        styles.input,
                        {
                          borderColor: errors.repeatPassword
                            ? errorColor
                            : borderColor,
                          color: textColor,
                        },
                      ]}
                      testID="repeat-password-input"
                    />
                  )}
                />
                {errors.repeatPassword && (
                  <Text
                    style={[styles.errorText, { color: errorColor }]}
                    testID="repeat-password-error"
                  >
                    {errors.repeatPassword.message}
                  </Text>
                )}
              </View>

              {errors.root && (
                <Text
                  style={[
                    styles.errorText,
                    { color: errorColor, textAlign: "center" },
                  ]}
                  testID="form-error"
                >
                  {errors.root.message}
                </Text>
              )}
            </View>

            {/* Sign Up Button */}
            <Animated.View
              style={[
                styles.buttonContainer,
                { transform: [{ scale: buttonScaleAnim }] },
              ]}
              testID="sign-up-button-container"
            >
              <TouchableOpacity
                onPress={handleSubmit(onSignUp)}
                disabled={loading || isSubmitting}
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor: textColor,
                    opacity: loading || isSubmitting ? 0.7 : 1,
                  },
                ]}
                testID="sign-up-button"
              >
                <Text
                  style={[styles.primaryButtonText, { color: backgroundColor }]}
                  testID="sign-up-button-text"
                >
                  {loading ? "Creating Account..." : "Create Account"}
                </Text>
              </TouchableOpacity>
            </Animated.View>

            {/* Sign In Link */}
            <Animated.View
              style={[
                styles.linkContainer,
                { transform: [{ scale: signinScaleAnim }] },
              ]}
              testID="sign-in-link-container"
            >
              <TouchableOpacity
                onPress={handleSignInPress}
                style={[styles.secondaryButton, { borderColor }]}
                testID="sign-in-link-button"
              >
                <Text
                  style={[styles.secondaryButtonText, { color: textColor }]}
                  testID="sign-in-link-text"
                >
                  Already have an account? Sign in
                </Text>
              </TouchableOpacity>
            </Animated.View>

            {/* Terms */}
            <View style={styles.termsContainer} testID="terms-container">
              <Text
                style={[styles.termsText, { color: subtleColor }]}
                testID="terms-text"
              >
                By creating an account, you agree to our{"\n"}Terms of Service
                and Privacy Policy
              </Text>
            </View>
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
  label: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
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
  passwordHints: {
    marginTop: 12,
  },
  hintText: {
    fontSize: 13,
    marginBottom: 4,
    fontWeight: "400",
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
  linkContainer: {
    alignItems: "center",
    marginBottom: 20,
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
  termsContainer: {
    alignItems: "center",
  },
  termsText: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 16,
    fontWeight: "400",
  },
});
