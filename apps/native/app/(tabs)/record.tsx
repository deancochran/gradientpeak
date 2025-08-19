import * as React from "react";
import { StyleSheet } from "react-native";

import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { ThemedView } from "@/components/ThemedView";

export default function RecordScreen() {
  return (
    <ThemedView style={styles.screen}>
      <Card style={styles.card}>
        <Text variant="title" style={styles.title}>
          Record
        </Text>

        <Text style={styles.subtitle}>
          Log a new activity or start a session. Use the quick actions below to
          begin recording.
        </Text>

        <Card style={styles.placeholder}>
          <Text style={styles.placeholderText}>Start a new record →</Text>
        </Card>
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
    marginBottom: 12,
    lineHeight: 20,
  },
  placeholder: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  placeholderText: {
    color: "#0a84ff",
    fontWeight: "600",
  },
});
