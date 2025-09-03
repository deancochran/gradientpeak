// record.tsx — Refactored for clarity, UX polish, and maintainability
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { FeatureGate } from "@/components/FeatureGate";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useBluetooth } from "@/hooks/useBluetooth";

import { BluetoothDeviceModal } from "@/modals/BluetoothDeviceModal";
import { RecordModal } from "@/modals/RecordModal";

// Use Ionicons' glyph map to keep icon names type-safe
type IoniconName = keyof typeof Ionicons.glyphMap;

type FeatureItem = {
  icon: IoniconName;
  title: string;
  description: string;
  isEnabled: boolean;
  testID: string;
  accessibilityHint?: string;
};

export default function RecordScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [bluetoothModalVisible, setBluetoothModalVisible] = useState(false);

  const bluetooth = useBluetooth({ autoInitialize: true, autoConnect: true });

  const { connectedDevices, isBluetoothEnabled, autoConnectPreferredDevices } =
    bluetooth;

  const connectedCount = connectedDevices?.length ?? 0;
  const hasSensors = Boolean(connectedCount);

  // Attempt auto-connect only when permissions are granted & BT is on
  const handlePermissionsGranted = useCallback(() => {
    if (isBluetoothEnabled) {
      autoConnectPreferredDevices();
    }
  }, [autoConnectPreferredDevices, isBluetoothEnabled]);

  const handleOpenRecordModal = useCallback(async () => {
    // Small tactile confirmation & announce for screen readers
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // no-op (haptics not critical)
    }
    AccessibilityInfo.announceForAccessibility?.("Opening workout options");
    setModalVisible(true);
  }, []);

  const handleCloseRecordModal = useCallback(() => {
    setModalVisible(false);
  }, []);

  const features: FeatureItem[] = useMemo(() => {
    return [
      {
        icon: "location-outline",
        title: "GPS Tracking",
        description: "Accurate route and distance tracking",
        isEnabled: true,
        testID: "feature-gps",
      },
      {
        icon: "heart-outline",
        title: "Heart Rate & Sensors",
        description: `Monitor heart rate, power, and cadence${
          hasSensors ? ` (${connectedCount} connected)` : ""
        }`,
        isEnabled: isBluetoothEnabled || hasSensors,
        testID: "feature-sensors",
        accessibilityHint: isBluetoothEnabled
          ? "Bluetooth enabled"
          : "Enable Bluetooth to connect sensors",
      },
      {
        icon: "time-outline",
        title: "Real-time Metrics",
        description: "Live pace, distance, and duration",
        isEnabled: true,
        testID: "feature-metrics",
      },
    ];
  }, [connectedCount, hasSensors, isBluetoothEnabled]);

  return (
    <ThemedView style={styles.root} testID="record-screen">
      <SafeAreaView style={styles.safeArea}>
        <FeatureGate
          requiredPermissions={["location", "bluetooth"]}
          title="Workout Recording Permissions"
          description="To unlock all workout tracking features, we need access to your location for GPS tracking and Bluetooth for heart rate sensors."
          onPermissionsGranted={handlePermissionsGranted}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            testID="record-scroll-view"
          >
            <View style={styles.header}>
              <View style={styles.heroIcon}>
                <Ionicons
                  name="add-circle-outline"
                  size={80}
                  // Dark neutral—plays nicely with light/dark themed backgrounds
                  color="#111827"
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              </View>
              <Text style={styles.title} accessibilityRole="header">
                Ready to Record
              </Text>
              <Text style={styles.subtitle}>
                Track your workout with real-time metrics and GPS tracking
              </Text>
            </View>

            {/* Bluetooth Status */}
            {isBluetoothEnabled && hasSensors && (
              <View
                style={styles.bluetoothStatus}
                accessible
                accessibilityLabel={`Bluetooth sensors connected: ${connectedCount}`}
              >
                <Ionicons name="bluetooth" size={20} color="#10b981" />
                <Text style={styles.bluetoothStatusText}>
                  {connectedCount} sensor{connectedCount > 1 ? "s" : ""}{" "}
                  connected
                </Text>
              </View>
            )}

            {/* Feature Cards */}
            <View style={styles.features}>
              {features.map((feature) => {
                const disabled = !feature.isEnabled;
                return (
                  <Card
                    key={feature.testID}
                    style={[
                      styles.featureCard,
                      disabled && styles.featureCardDisabled,
                    ]}
                    testID={feature.testID}
                    accessible
                    accessibilityRole="summary"
                    accessibilityState={{ disabled }}
                    accessibilityHint={feature.accessibilityHint}
                  >
                    <Ionicons
                      name={feature.icon}
                      size={24}
                      color={disabled ? "#9ca3af" : "#111827"}
                      style={styles.featureIcon}
                    />
                    <View style={styles.featureText}>
                      <Text
                        style={[
                          styles.featureTitle,
                          disabled && styles.textMuted,
                        ]}
                      >
                        {feature.title}
                      </Text>
                      <Text
                        style={[
                          styles.featureDescription,
                          disabled && styles.textSubtle,
                        ]}
                      >
                        {feature.description}
                      </Text>
                    </View>
                    {disabled && (
                      <Ionicons
                        name="lock-closed"
                        size={16}
                        color="#9ca3af"
                        accessibilityLabel="Locked until enabled"
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                      />
                    )}
                  </Card>
                );
              })}
            </View>
          </ScrollView>

          {/* Primary action is anchored above the safe-area/bottom */}
          <View style={styles.ctaContainer} pointerEvents="box-none">
            <Pressable
              style={({ pressed }) => [
                styles.cta,
                pressed && styles.ctaPressed,
                !(isBluetoothEnabled || true) && styles.ctaDisabled, // reserved for future gating
              ]}
              onPress={handleOpenRecordModal}
              accessibilityRole="button"
              accessibilityLabel="Start workout"
              accessibilityHint="Opens workout recording options"
              android_ripple={
                Platform.OS === "android" ? { borderless: false } : undefined
              }
              testID="main-record-button"
            >
              <Ionicons name="add" size={32} color="white" />
              <Text style={styles.ctaText}>Start Workout</Text>
            </Pressable>
          </View>

          <RecordModal
            visible={modalVisible}
            onClose={handleCloseRecordModal}
            onOpenBluetoothModal={() => setBluetoothModalVisible(true)}
            bluetooth={bluetooth}
          />
          <BluetoothDeviceModal
            visible={bluetoothModalVisible}
            onClose={() => setBluetoothModalVisible(false)}
            onDeviceSelect={(deviceId) => {
              console.log("Selected device:", deviceId);
            }}
            bluetooth={bluetooth}
          />
        </FeatureGate>
      </SafeAreaView>
    </ThemedView>
  );
}

// Main Styles
const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 120,
  },
  header: {
    alignItems: "center",
    marginBottom: 16,
  },
  heroIcon: {
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
    maxWidth: 320,
  },

  bluetoothStatus: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#d1fae5",
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    gap: 8,
  },
  bluetoothStatusText: {
    fontSize: 14,
    color: "#065f46",
    fontWeight: "600",
  },

  features: {
    gap: 16,
    width: "100%",
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  featureCardDisabled: {
    backgroundColor: "#f9fafb",
    opacity: 0.85,
  },
  featureIcon: {
    marginRight: 16,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 3,
  },
  featureDescription: {
    fontSize: 14,
    color: "#6b7280",
  },
  textMuted: {
    color: "#9ca3af",
  },
  textSubtle: {
    color: "#d1d5db",
  },

  ctaContainer: {
    position: "absolute",
    bottom: 24,
    left: 20,
    right: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  cta: {
    backgroundColor: "#111827",
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 220,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 5,
  },
  ctaPressed: {
    transform: [{ scale: 0.98 }],
    shadowOpacity: 0.12,
  },
  ctaDisabled: {
    backgroundColor: "#e5e7eb",
  },
  ctaText: {
    color: "white",
    fontSize: 18,
    fontWeight: "800",
  },
});
