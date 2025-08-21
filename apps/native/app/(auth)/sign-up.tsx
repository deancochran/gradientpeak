import * as React from "react";
import { StyleSheet, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { useSignUp } from "@clerk/clerk-expo";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";

export default function SignUpScreen() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();

  const [emailAddress, setEmailAddress] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pendingVerification, setPendingVerification] = React.useState(false);
  const [code, setCode] = React.useState("");

  const [loading, setLoading] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [infoMessage, setInfoMessage] = React.useState<string | null>(null);

  const canSubmit =
    emailAddress.trim().length > 0 && password.length > 0 && !loading;
  const canVerify = code.trim().length > 0 && !verifying;

  // Handle submission of sign-up form
  const onSignUpPress = async () => {
    if (!isLoaded || !canSubmit) return;

    setLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      // Start sign-up process using email and password provided
      await signUp.create({
        emailAddress,
        password,
      });

      // Send user an email with verification code
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });

      // Set 'pendingVerification' to true to display second form
      setPendingVerification(true);
      setInfoMessage("A verification code was sent to your email.");
    } catch (err: any) {
      // Surface a friendly error while logging details
      const friendly =
        err?.message ||
        err?.errors?.[0]?.message ||
        "Failed to create an account. Please try again.";
      setErrorMessage(String(friendly));
      // eslint-disable-next-line no-console
      console.error("SignUp error:", JSON.stringify(err, null, 2));
    } finally {
      setLoading(false);
    }
  };

  // Handle submission of verification form
  const onVerifyPress = async () => {
    if (!isLoaded || !canVerify) return;

    setVerifying(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      // Use the code the user provided to attempt verification
      const signUpAttempt = await signUp.attemptEmailAddressVerification({
        code,
      });

      // If verification was completed, set the session to active
      // and redirect the user
      if (signUpAttempt.status === "complete") {
        await setActive({ session: signUpAttempt.createdSessionId });
        router.replace("/");
      } else {
        // If the status is not complete, check why. User may need to
        // complete further steps.
        setErrorMessage(
          "Verification incomplete. Please check the code and try again.",
        );
        // eslint-disable-next-line no-console
        console.error(
          "SignUp verification intermediate:",
          JSON.stringify(signUpAttempt, null, 2),
        );
      }
    } catch (err: any) {
      const friendly =
        err?.message ||
        err?.errors?.[0]?.message ||
        "Verification failed. Please check the code and try again.";
      setErrorMessage(String(friendly));
      // eslint-disable-next-line no-console
      console.error("Verify error:", JSON.stringify(err, null, 2));
    } finally {
      setVerifying(false);
    }
  };

  const onResendCode = async () => {
    if (!isLoaded) return;

    setErrorMessage(null);
    setInfoMessage(null);
    setLoading(true);

    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setInfoMessage("Verification code resent. Check your email.");
    } catch (err: any) {
      const friendly =
        err?.message ||
        err?.errors?.[0]?.message ||
        "Unable to resend verification code. Please try again later.";
      setErrorMessage(String(friendly));
      // eslint-disable-next-line no-console
      console.error("Resend error:", JSON.stringify(err, null, 2));
    } finally {
      setLoading(false);
    }
  };

  if (pendingVerification) {
    return (
      <ThemedView style={styles.screen} testID="verification-screen">
        <Card style={styles.card}>
          <View style={styles.header}>
            <Text variant="title" style={styles.title}>
              Verify your email
            </Text>
            <ThemedText type="subtitle" style={styles.subtitle}>
              Enter the code we sent to {emailAddress}
            </ThemedText>
          </View>

          {verifying && (
            <View testID="loading-spinner" style={styles.loadingIndicator}>
              <ThemedText>Loading...</ThemedText>
            </View>
          )}

          {errorMessage ? (
            <View style={styles.alertError} testID="error-message" role="alert">
              <ThemedText style={styles.alertErrorText}>
                {errorMessage}
              </ThemedText>
            </View>
          ) : null}

          {infoMessage ? (
            <View style={styles.alertInfo} testID="success-message">
              <ThemedText style={styles.alertInfoText}>
                {infoMessage}
              </ThemedText>
            </View>
          ) : null}

          <View style={styles.form}>
            <Input
              testID="verification-code-input"
              value={code}
              placeholder="Enter verification code"
              onChangeText={(t: string) => setCode(t)}
              style={styles.input}
              accessibilityLabel="Verification code"
              accessibilityRole="textbox"
              keyboardType="number-pad"
            />

            <Button
              testID="verify-button"
              onPress={onVerifyPress}
              disabled={!canVerify}
              style={styles.button}
              accessibilityLabel="Verify email address"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canVerify }}
            >
              {verifying ? "Verifying..." : "Verify"}
            </Button>

            <View style={styles.row}>
              <ThemedText>Didn't receive an email?</ThemedText>
              <Button
                testID="resend-code-button"
                onPress={onResendCode}
                disabled={loading}
                style={styles.linkButton}
                accessibilityRole="button"
                accessibilityLabel="Resend verification code"
              >
                Resend code
              </Button>
            </View>

            <View style={styles.row}>
              <ThemedText>Already have an account?</ThemedText>
              <Link href="/sign-in" style={styles.link}>
                <Text variant="link" testID="sign-in-link" accessibilityRole="link"> Sign in</Text>
              </Link>
            </View>
          </View>
        </Card>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen} testID="sign-up-screen">
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text variant="title" style={styles.title}>
            Create account
          </Text>
          <ThemedText type="subtitle" style={styles.subtitle}>
            Start your journey — sign up with your email
          </ThemedText>
        </View>

        {loading && (
          <View testID="loading-spinner" style={styles.loadingIndicator}>
            <ThemedText>Loading...</ThemedText>
          </View>
        )}

        {errorMessage ? (
          <View style={styles.alertError} testID="error-message" role="alert">
            <ThemedText style={styles.alertErrorText}>
              {errorMessage}
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.form}>
          <Input
            testID="email-input"
            autoCapitalize="none"
            keyboardType="email-address"
            value={emailAddress}
            placeholder="you@example.com"
            onChangeText={(email) => setEmailAddress(email)}
            style={styles.input}
            accessibilityLabel="Email address"
            accessibilityRole="textbox"
          />

          <Input
            testID="password-input"
            value={password}
            placeholder="Choose a password"
            secureTextEntry
            onChangeText={(p) => setPassword(p)}
            style={styles.input}
            accessibilityLabel="Password"
            accessibilityRole="textbox"
          />

          <Button
            testID="sign-up-button"
            onPress={onSignUpPress}
            disabled={!canSubmit}
            style={styles.button}
            accessibilityLabel="Create new account"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit }}
          >
            {loading ? "Creating account..." : "Create account"}
          </Button>

          <View style={styles.row}>
            <ThemedText>Already have an account?</ThemedText>
            <Link href="/sign-in" style={styles.link}>
              <Text variant="link" testID="sign-in-link" accessibilityRole="link"> Sign in</Text>
            </Link>
          </View>
        </View>
      </Card>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 16,
    justifyContent: "center",
  },
  card: {
    padding: 16,
    borderRadius: 12,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 4,
    color: "#666",
  },
  form: {
    gap: 12,
  },
  input: {},
  button: {
    marginTop: 8,
  },
  row: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  link: {
    marginLeft: 6,
  },
  linkButton: {
    backgroundColor: "transparent",
    paddingHorizontal: 6,
    paddingVertical: 0,
  },
  alertError: {
    backgroundColor: "rgba(255,80,80,0.08)",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  alertErrorText: {
    color: "#B00020",
  },
  alertInfo: {
    backgroundColor: "rgba(10,132,255,0.06)",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  alertInfoText: {
    color: "#0a84ff",
  },
  loadingIndicator: {
    padding: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
});
