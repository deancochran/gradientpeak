import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Switch,
  View,
} from "react-native";

import { SignOutButton } from "@/components/SignOutButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";
import { ActivityService } from "@/lib/services/activity-service";
import { ProfileService } from "@/lib/services/profile-service";
import { calculateHrZones } from "@repo/core/calculations";

export default function SettingsScreen() {
  const { session } = useAuth();

  // TanStack Query hooks
  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
  } = trpc.profiles.get.useQuery();
  const updateProfileMutation = trpc.profiles.update.useMutation();

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

  const saveProfile = async () => {
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
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </View>
    );
  }

  const hrZones = getHeartRateZones();

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ opacity: fadeAnim }}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Settings</Text>
            <Button
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
            </Button>
          </View>

          {isEditing && (
            <Button onPress={cancelEdit} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Button>
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
                  <Button
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
                  </Button>
                ))}
              </View>
            </View>
          </View>

          {/* Training Metrics */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Training Metrics</Text>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>FTP (watts)</Text>
              <Input
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

          </View>



          {/* Sign Out */}
          <View style={styles.signOutSection}>
            <SignOutButton />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
