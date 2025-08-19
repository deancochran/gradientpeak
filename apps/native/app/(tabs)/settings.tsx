import * as React from "react";
import { StyleSheet, View } from "react-native";

import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";

export default function SettingsScreen() {
  return (
    <ThemedView style={styles.screen}>
      <Card style={styles.card}>
        <Text variant="title" style={styles.title}>
          Settings
        </Text>

        <ThemedText type="subtitle" style={styles.subtitle}>
          Manage account, preferences, and app settings.
        </ThemedText>

        {/* Account section */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <ThemedText style={styles.sectionBody}>
            Manage your account information and authentication methods.
          </ThemedText>

          <View style={styles.actionsRow}>
            <Button style={styles.actionBtn}>Edit profile</Button>
            <Button style={styles.ghostBtn}>Manage security</Button>
          </View>
        </Card>

        {/* Preferences section */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <ThemedText style={styles.sectionBody}>
            Configure notifications, units, and other preferences.
          </ThemedText>

          <View style={styles.actionsRow}>
            <Button style={styles.actionBtn}>Notifications</Button>
            <Button style={styles.actionBtn}>Units</Button>
          </View>
        </Card>

        {/* About / support */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <ThemedText style={styles.sectionBody}>
            App version and support resources.
          </ThemedText>

          <View style={styles.actionsRow}>
            <Button style={styles.actionBtn}>Help & feedback</Button>
            <Button style={styles.ghostBtn}>Privacy</Button>
          </View>
        </Card>
      </Card>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 16,
    backgroundColor: undefined,
  },
  card: {
    padding: 16,
    borderRadius: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 6,
  },
  subtitle: {
    color: "#666",
    marginBottom: 12,
    lineHeight: 20,
  },
  section: {
    padding: 12,
    marginTop: 12,
    borderRadius: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  sectionBody: {
    color: "#666",
    marginTop: 6,
    marginBottom: 10,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-start",
    flexWrap: "wrap",
  },
  actionBtn: {
    marginRight: 8,
    marginTop: 6,
  },
  ghostBtn: {
    marginTop: 6,
    backgroundColor: "transparent",
    // Let the Button component's default handle border/appearance if available.
  },
});
