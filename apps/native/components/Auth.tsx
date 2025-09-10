import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { supabase } from "@lib/supabase";
import React, { useState } from "react";
import { Alert, AppState, StyleSheet, View } from "react-native";

// Tells Supabase Auth to continuously refresh the session automatically if
// the app is in the foreground. When this is added, you will continue to receive
// `onAuthStateChange` events with the `TOKEN_REFRESHED` or `SIGNED_OUT` event
// if the user's session is terminated. This should only be registered once.
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function signInWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) Alert.alert(error.message);
    setLoading(false);
  }

  async function signUpWithEmail() {
    setLoading(true);
    const {
      data: { session },
      error,
    } = await supabase.auth.signUp({
      email: email,
      password: password,
    });

    if (error) Alert.alert(error.message);
    if (!session)
      Alert.alert("Please check your inbox for email verification!");
    setLoading(false);
  }

  return (
    <View style={styles.container} testID="auth-container">
      <View style={[styles.verticallySpaced, styles.mt20]}>
        <Input
          testID="auth-email-input"
          onChangeText={(text) => setEmail(text)}
          value={email}
          placeholder="email@address.com"
          autoCapitalize={"none"}
          accessibilityLabel="Email address"
          accessibilityRole="text"
          keyboardType="email-address"
        />
      </View>
      <View style={styles.verticallySpaced}>
        <Input
          testID="auth-password-input"
          onChangeText={(text) => setPassword(text)}
          value={password}
          secureTextEntry={true}
          placeholder="Password"
          autoCapitalize={"none"}
          accessibilityLabel="Password"
          accessibilityRole="text"
        />
      </View>
      <View style={[styles.verticallySpaced, styles.mt20]}>
        <Button
          testID="auth-sign-in-button"
          disabled={loading}
          onPress={() => signInWithEmail()}
          accessibilityLabel="Sign in with email"
          accessibilityRole="button"
          accessibilityState={{ disabled: loading }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </View>
      <View style={styles.verticallySpaced}>
        <Button
          testID="auth-sign-up-button"
          disabled={loading}
          onPress={() => signUpWithEmail()}
          accessibilityLabel="Sign up with email"
          accessibilityRole="button"
          accessibilityState={{ disabled: loading }}
        >
          {loading ? "Signing up..." : "Sign up"}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 40,
    padding: 12,
  },
  verticallySpaced: {
    paddingTop: 4,
    paddingBottom: 4,
    alignSelf: "stretch",
  },
  mt20: {
    marginTop: 20,
  },
});
