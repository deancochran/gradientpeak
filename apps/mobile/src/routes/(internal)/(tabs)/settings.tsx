import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, View } from "react-native";

import { SignOutButton } from "@/components/SignOutButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";

export default function SettingsScreen() {
  const { user } = useAuth();

  // TanStack Query hooks
  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
  } = trpc.profiles.get.useQuery();
  const updateProfileMutation = trpc.profiles.update.useMutation();

  return (
    <View
      testID="settings-screen"
      className="flex-1 bg-background h-full items-center justify-center"
    >
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
      {/* Debug Info */}
      {__DEV__ && (
        <View>
          <Text>Debug Info</Text>
          <Text>Profile ID: {user?.id || "None"}</Text>
          <Text>Profile Username: {user?.email || "None"}</Text>
        </View>
      )}
    </View>
  );
}
