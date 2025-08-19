import * as React from "react";
import { StyleSheet } from "react-native";

import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { ThemedView } from "@/components/ThemedView";

export default function HomeScreen() {
  return (
    <ThemedView style={styles.screen}>
      <Card style={styles.card}>
        <Text variant="title" style={styles.title}>
          Home
        </Text>

        <Text style={styles.subtitle}>
          Welcome back — this is your dashboard. Use the tabs to record
          activity, adjust settings, and explore the app.
        </Text>
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
    padding: 18,
    borderRadius: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    color: "#666",
    lineHeight: 20,
  },
});
