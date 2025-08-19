import React from "react";
import { StyleSheet, View } from "react-native";
import { useSignIn } from "@clerk/clerk-expo";
import { Link, useRouter } from "expo-router";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";

export default function Page() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();

  const [emailAddress, setEmailAddress] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const canSubmit =
    emailAddress.trim().length > 0 && password.length > 0 && !loading;

  const onSignInPress = async () => {
    if (!isLoaded || !canSubmit) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      const signInAttempt = await signIn.create({
        identifier: emailAddress,
        password,
      });

      if (signInAttempt.status === "complete") {
        await setActive({ session: signInAttempt.createdSessionId });
        router.replace("/");
      } else {
        // Unexpected intermediate state - surface details to the user
        setErrorMessage(
          "Additional authentication steps required. Please check your account.",
        );
        // Still log full detail for debugging
        // eslint-disable-next-line no-console
        console.error(
          "SignIn intermediate response:",
          JSON.stringify(signInAttempt, null, 2),
        );
      }
    } catch (err: any) {
      // Show a friendly error message while preserving raw error to logs
      const friendly =
        err?.message ||
        err?.errors?.[0]?.message ||
        "Unable to sign in. Please check your credentials and try again.";
      setErrorMessage(String(friendly));
      // eslint-disable-next-line no-console
      console.error("SignIn error:", JSON.stringify(err, null, 2));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={styles.screen}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text variant="title" style={styles.title}>
            Welcome back
          </Text>
          <ThemedText type="subtitle" style={styles.subtitle}>
            Sign in to continue
          </ThemedText>
        </View>

        {errorMessage ? (
          <View style={styles.errorBox}>
            <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
          </View>
        ) : null}

        <View style={styles.form}>
          <Input
            value={emailAddress}
            placeholder="Email address"
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={(text: string) => setEmailAddress(text)}
            style={styles.input}
            accessibilityLabel="Email address"
          />
          <Input
            value={password}
            placeholder="Password"
            secureTextEntry
            onChangeText={(text: string) => setPassword(text)}
            style={styles.input}
            accessibilityLabel="Password"
          />

          <Button
            onPress={onSignInPress}
            disabled={!canSubmit}
            style={styles.primaryButton}
            accessibilityLabel="Sign in"
          >
            {loading ? "Signing in..." : "Continue"}
          </Button>

          <View style={styles.footerRow}>
            <ThemedText>Don't have an account?</ThemedText>
            <Link href="/sign-up" style={styles.link}>
              <Text variant="link"> Sign up</Text>
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
    // Add a little elevation if platform supports it via Card default styling,
    // keep here minimal so the Card component can control exact appearance.
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
  errorBox: {
    backgroundColor: "rgba(255,80,80,0.08)",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    color: "#B00020",
  },
  form: {
    gap: 12,
  },
  input: {
    // Leave most styling to the Input component; use spacing only
  },
  primaryButton: {
    marginTop: 8,
  },
  footerRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  link: {
    // Let the Text variant="link" drive link styling; keep spacing here.
  },
});
