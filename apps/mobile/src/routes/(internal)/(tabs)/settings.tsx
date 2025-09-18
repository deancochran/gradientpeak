import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { SignOutButton } from "@/components/SignOutButton";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useProfile, useUpdateProfile } from "@/lib/api/trpc-hooks";
import { ActivityService } from "@/lib/services/activity-service";
import { ProfileService } from "@/lib/services/profile-service";
import { useAuth } from "@/lib/stores";
import { calculateHrZones } from "@repo/core/calculations";

export default function SettingsScreen() {
  const { session } = useAuth();

  // TanStack Query hooks
  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
  } = useProfile();
  const updateProfileMutation = useUpdateProfile();
  const createProfileMutation = useCreateProfile();

  const [isEditing, setIsEditing] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    username: "",
    weightKg: undefined as number | undefined,
    ftp: undefined as number | undefined,
    thresholdHr: undefined as number | undefined,
    gender: "other" as string,
    preferredUnits: "metric" as string,
  });

  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    console.log("⚙️ Settings Screen - Initializing");
    initializeSettings();
  }, [profile, profileLoading]);

  const initializeSettings = async () => {
    if (!profileLoading) {
      if (profile) {
        setFormData({
          username: profile.username || "",
          weightKg: profile.weightKg ? Number(profile.weightKg) : undefined,
          ftp: profile.ftp || undefined,
          thresholdHr: profile.thresholdHr || undefined,
          gender: profile.gender || "other",
          preferredUnits: profile.preferredUnits || "metric",
        });
        console.log("⚙️ Settings Screen - Profile loaded:", {
          username: profile.username,
          ftp: profile.ftp,
          units: profile.preferredUnits,
        });
      } else if (!profile && !profileError) {
        console.log(
          "⚙️ Settings Screen - No profile found, starting in edit mode",
        );
        setIsEditing(true);
      }

      // Animate entrance
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
    }
  };

  const saveProfile = async () => {
    console.log("⚙️ Settings Screen - Saving profile:", formData);

    try {
      // Convert weightKg to string for database storage
      const profileData = {
        ...formData,
        weightKg: formData.weightKg ? formData.weightKg.toString() : null,
      };

      if (profile) {
        await updateProfileMutation.mutateAsync(profileData);
      } else {
        await createProfileMutation.mutateAsync(profileData);
      }

      setIsEditing(false);
      console.log("⚙️ Settings Screen - Profile saved successfully");
      Alert.alert("Success", "Profile saved successfully");
    } catch (error) {
      console.error("⚙️ Settings Screen - Save error:", error);
      Alert.alert("Error", "Failed to save profile");
    }
  };

  const cancelEdit = () => {
    console.log("⚙️ Settings Screen - Canceling edit");
    if (profile) {
      setFormData({
        username: profile.username || "",
        weightKg: profile.weightKg ? Number(profile.weightKg) : undefined,
        ftp: profile.ftp || undefined,
        thresholdHr: profile.thresholdHr || undefined,
        gender: profile.gender || "other",
        preferredUnits: profile.preferredUnits || "metric",
      });
      setIsEditing(false);
    }
  };

  const handleStorageStatus = useCallback(async () => {
    console.log("⚙️ Settings Screen - Showing storage status");
    if (profile?.id) {
      await ActivityService.showStorageStatus(profile.id);
    }
  }, [profile]);

  const handleClearCache = useCallback(async () => {
    Alert.alert(
      "Clear Cache",
      "This will clear all cached data. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            ProfileService.clearCache();
            console.log("⚙️ Settings Screen - Cache cleared");
            Alert.alert("Success", "Cache cleared successfully");
          },
        },
      ],
    );
  }, []);

  const getHeartRateZones = () => {
    if (!profile?.thresholdHr) return null;
    return calculateHrZones(profile.thresholdHr);
  };

  const userData = {
    name: profile?.username || session?.user?.email?.split("@")[0] || "User",
    email: session?.user?.email || "No email",
    joinDate: profile?.createdAt
      ? new Date(profile.createdAt).toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        })
      : "Unknown",
  };

  if (profileLoading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </ThemedView>
    );
  }

  const hrZones = getHeartRateZones();

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Settings</Text>
            <TouchableOpacity
              onPress={isEditing ? saveProfile : () => setIsEditing(true)}
              disabled={
                updateProfileMutation.isPending ||
                createProfileMutation.isPending
              }
              style={[
                styles.editButton,
                (updateProfileMutation.isPending ||
                  createProfileMutation.isPending) &&
                  styles.buttonDisabled,
              ]}
            >
              <Ionicons
                name={isEditing ? "checkmark" : "pencil"}
                size={20}
                color="#3b82f6"
              />
              <Text style={styles.editButtonText}>
                {updateProfileMutation.isPending ||
                createProfileMutation.isPending
                  ? "Saving..."
                  : isEditing
                    ? "Save"
                    : "Edit"}
              </Text>
            </TouchableOpacity>
          </View>

          {isEditing && (
            <TouchableOpacity onPress={cancelEdit} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          )}

          {/* User Profile */}
          <Card style={styles.profileCard} testID="profile-card">
            <View style={styles.profileHeader}>
              <View style={styles.avatarContainer}>
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={32} color="#3b82f6" />
                </View>
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName} testID="user-name">
                  {userData.name}
                </Text>
                <Text style={styles.userEmail}>{userData.email}</Text>
                <Text style={styles.joinDate}>
                  Member since {userData.joinDate}
                </Text>
              </View>
            </View>
          </Card>

          {/* Profile Settings */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Profile Information</Text>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Username</Text>
              <TextInput
                style={[
                  styles.textInput,
                  !isEditing && styles.textInputDisabled,
                ]}
                value={formData.username || ""}
                onChangeText={(text) =>
                  setFormData((prev) => ({ ...prev, username: text }))
                }
                placeholder="Enter username"
                editable={isEditing}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Weight (kg)</Text>
              <TextInput
                style={[
                  styles.textInput,
                  !isEditing && styles.textInputDisabled,
                ]}
                value={formData.weightKg?.toString() || ""}
                onChangeText={(text) =>
                  setFormData((prev) => ({
                    ...prev,
                    weightKg: text ? Number(text) : undefined,
                  }))
                }
                placeholder="70"
                keyboardType="numeric"
                editable={isEditing}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Gender</Text>
              <View style={styles.genderRow}>
                {(["male", "female", "other"] as const).map((gender) => (
                  <TouchableOpacity
                    key={gender}
                    onPress={() =>
                      isEditing &&
                      setFormData((prev) => ({
                        ...prev,
                        gender,
                      }))
                    }
                    style={[
                      styles.genderOption,
                      formData.gender === gender && styles.genderOptionSelected,
                      !isEditing && styles.genderOptionDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.genderOptionText,
                        formData.gender === gender &&
                          styles.genderOptionTextSelected,
                      ]}
                    >
                      {gender.charAt(0).toUpperCase() + gender.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Training Metrics */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Training Metrics</Text>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>FTP (watts)</Text>
              <TextInput
                style={[
                  styles.textInput,
                  !isEditing && styles.textInputDisabled,
                ]}
                value={formData.ftp?.toString() || ""}
                onChangeText={(text) =>
                  setFormData((prev) => ({
                    ...prev,
                    ftp: text ? Number(text) : undefined,
                  }))
                }
                placeholder="250"
                keyboardType="numeric"
                editable={isEditing}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Threshold HR (bpm)</Text>
              <TextInput
                style={[
                  styles.textInput,
                  !isEditing && styles.textInputDisabled,
                ]}
                value={formData.thresholdHr?.toString() || ""}
                onChangeText={(text) =>
                  setFormData((prev) => ({
                    ...prev,
                    thresholdHr: text ? Number(text) : undefined,
                  }))
                }
                placeholder="180"
                keyboardType="numeric"
                editable={isEditing}
              />
            </View>

            {/* Heart Rate Zones Display */}
            {hrZones && (
              <View style={styles.zonesContainer}>
                <Text style={styles.zonesTitle}>Heart Rate Zones</Text>
                {Object.entries(hrZones).map(([zone, value]) => (
                  <View key={zone} style={styles.zoneRow}>
                    <Text style={styles.zoneLabel}>
                      Zone {zone.replace("zone", "")}:
                    </Text>
                    <Text style={styles.zoneValue}>
                      {Math.round(value)} bpm
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Preferences */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Preferences</Text>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Units</Text>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Metric</Text>
                <Switch
                  value={formData.preferredUnits === "imperial"}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      preferredUnits: value ? "imperial" : "metric",
                    }))
                  }
                  disabled={!isEditing}
                  trackColor={{ false: "#d1d5db", true: "#3b82f6" }}
                  thumbColor={
                    formData.preferredUnits === "imperial"
                      ? "#ffffff"
                      : "#f4f3f4"
                  }
                />
                <Text style={styles.switchLabel}>Imperial</Text>
              </View>
            </View>
          </View>

          {/* App Settings */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>App Settings</Text>
            <Card style={styles.settingsCard}>
              {[
                {
                  icon: "storage-outline",
                  label: "Storage & Sync",
                  onPress: handleStorageStatus,
                },
                {
                  icon: "refresh-outline",
                  label: "Clear Cache",
                  onPress: handleClearCache,
                },
                {
                  icon: "notifications-outline",
                  label: "Notifications",
                },
                {
                  icon: "shield-outline",
                  label: "Privacy & Security",
                },
                {
                  icon: "help-circle-outline",
                  label: "Help & Support",
                },
              ].map((item, idx) => (
                <React.Fragment key={item.label}>
                  <TouchableOpacity
                    style={styles.settingItem}
                    onPress={item.onPress}
                    testID={`setting-${item.label}`}
                  >
                    <View style={styles.settingIcon}>
                      <Ionicons
                        name={item.icon as keyof typeof Ionicons.glyphMap}
                        size={20}
                        color="#3b82f6"
                      />
                    </View>
                    <Text style={styles.settingText}>{item.label}</Text>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color="#9ca3af"
                    />
                  </TouchableOpacity>
                  {idx < 4 && <View style={styles.settingDivider} />}
                </React.Fragment>
              ))}
            </Card>
          </View>

          {/* Sign Out */}
          <View style={styles.signOutSection}>
            <SignOutButton />
          </View>

          {/* Debug Info */}
          {__DEV__ && (
            <View style={styles.debugSection}>
              <Text style={styles.debugTitle}>Debug Info</Text>
              <Text style={styles.debugText}>
                Profile ID: {profile?.id || "None"}
              </Text>
              <Text style={styles.debugText}>
                FTP: {profile?.ftp || "Not set"}
              </Text>
              <Text style={styles.debugText}>
                Threshold HR: {profile?.thresholdHr || "Not set"}
              </Text>
              <Text style={styles.debugText}>
                Units: {profile?.preferredUnits || "metric"}
              </Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 120 },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#111827",
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#f0f9ff",
    borderRadius: 8,
  },
  editButtonText: {
    marginLeft: 4,
    fontSize: 16,
    color: "#3b82f6",
    fontWeight: "500",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  cancelButton: {
    alignSelf: "flex-end",
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cancelButtonText: {
    color: "#ef4444",
    fontSize: 14,
  },
  profileCard: {
    padding: 20,
    marginBottom: 24,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  profileHeader: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatarContainer: { position: "relative" },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#f0f9ff",
    alignItems: "center",
    justifyContent: "center",
  },
  userInfo: { flex: 1, gap: 4 },
  userName: { fontSize: 20, fontWeight: "700", color: "#111827" },
  userEmail: { fontSize: 14, color: "#6b7280" },
  joinDate: { fontSize: 12, color: "#9ca3af" },
  section: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
  },
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#ffffff",
  },
  textInputDisabled: {
    backgroundColor: "#f9fafb",
    color: "#6b7280",
  },
  genderRow: {
    flexDirection: "row",
    gap: 8,
  },
  genderOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    alignItems: "center",
  },
  genderOptionSelected: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
  },
  genderOptionDisabled: {
    opacity: 0.6,
  },
  genderOptionText: {
    fontSize: 14,
    color: "#374151",
  },
  genderOptionTextSelected: {
    color: "#ffffff",
    fontWeight: "500",
  },
  zonesContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  zonesTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 12,
  },
  zoneRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  zoneLabel: {
    fontSize: 14,
    color: "#6b7280",
  },
  zoneValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchLabel: {
    fontSize: 14,
    color: "#374151",
  },
  settingsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
  },
  settingIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f0f9ff",
    alignItems: "center",
    justifyContent: "center",
  },
  settingText: { flex: 1, fontSize: 16, fontWeight: "500", color: "#111827" },
  settingDivider: { height: 1, backgroundColor: "#e5e7eb", marginLeft: 68 },
  signOutSection: { marginBottom: 24 },
  debugSection: {
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  debugText: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 4,
    fontFamily: "monospace",
  },
});
