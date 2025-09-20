import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import {
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  Button,
  View,
} from "react-native";

interface PermissionItem {
  name: string;
  description: string;
  granted: boolean;
  canAskAgain: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  required: boolean;
}

interface PermissionsModalProps {
  visible: boolean;
  onClose: () => void;
  permissions: Record<string, PermissionItem>;
  onRequestPermissions: () => Promise<boolean>;
  isRequesting?: boolean;
}

export const PermissionsModal: React.FC<PermissionsModalProps> = ({
  visible,
  onClose,
  permissions,
  onRequestPermissions,
  isRequesting = false,
}) => {
  // Debug logs for permissions modal
  useEffect(() => {
    if (visible) {
      console.log("🛡️ [DEBUG] PermissionsModal opened with data:", {
        permissions,
        permissionsList: Object.values(permissions),
        hasAllRequired: Object.values(permissions)
          .filter((p) => p.required)
          .every((p) => p.granted),
        deniedCount: Object.values(permissions).filter(
          (p) => !p.granted && p.required,
        ).length,
      });
    }
  }, [visible, permissions]);

  useEffect(() => {
    console.log(
      "🛡️ [DEBUG] PermissionsModal permissions prop changed:",
      permissions,
    );
  }, [permissions]);
  const permissionsList = Object.values(permissions);
  const hasAllRequiredPermissions = permissionsList
    .filter((p) => p.required)
    .every((p) => p.granted);

  const deniedPermissions = permissionsList.filter(
    (p) => !p.granted && p.required,
  );
  const permanentlyDeniedPermissions = permissionsList.filter(
    (p) => !p.granted && !p.canAskAgain && p.required,
  );

  const handleRequestPermissions = async () => {
    console.log("🛡️ [DEBUG] PermissionsModal handleRequestPermissions called");
    try {
      console.log("🛡️ [DEBUG] Calling onRequestPermissions...");
      const success = await onRequestPermissions();
      console.log("🛡️ [DEBUG] onRequestPermissions result:", success);
      if (success) {
        console.log("🛡️ [DEBUG] Success! Closing modal in 1 second...");
        // Brief delay to show success before closing
        setTimeout(() => {
          onClose();
        }, 1000);
      }
    } catch (error) {
      console.error("🛡️ [DEBUG] Failed to request permissions:", error);
      Alert.alert(
        "Error",
        "Failed to request permissions. Please try again or enable them manually in Settings.",
      );
    }
  };

  const handleOpenSettings = () => {
    Alert.alert(
      "Open Settings",
      "You'll need to manually enable permissions in your device settings.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Open Settings",
          onPress: () => {
            Linking.openSettings();
            onClose();
          },
        },
      ],
    );
  };

  const getPermissionStatusColor = (permission: PermissionItem) => {
    if (permission.granted) return "#10b981";
    if (!permission.canAskAgain) return "#ef4444";
    return "#f59e0b";
  };

  const getPermissionStatusIcon = (permission: PermissionItem) => {
    if (permission.granted) return "checkmark-circle";
    if (!permission.canAskAgain) return "close-circle";
    return "alert-circle";
  };

  const getStatusText = () => {
    if (hasAllRequiredPermissions) {
      return "All permissions are granted! You're ready to record activities.";
    }
    if (permanentlyDeniedPermissions.length > 0) {
      return "Some permissions need to be enabled in Settings to record activities.";
    }
    return "Some permissions are needed to record activities with full functionality.";
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Button onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#6b7280" />
          </Button>

          <Text style={styles.title}>Activity Permissions</Text>

          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Status Banner */}
          <View
            style={[
              styles.statusBanner,
              {
                backgroundColor: hasAllRequiredPermissions
                  ? "#f0fdf4"
                  : "#fef3c7",
              },
            ]}
          >
            <Ionicons
              name={hasAllRequiredPermissions ? "shield-checkmark" : "shield"}
              size={24}
              color={hasAllRequiredPermissions ? "#10b981" : "#f59e0b"}
            />
            <Text
              style={[
                styles.statusText,
                {
                  color: hasAllRequiredPermissions ? "#065f46" : "#92400e",
                },
              ]}
            >
              {getStatusText()}
            </Text>
          </View>

          {/* Permissions List */}
          <View style={styles.permissionsList}>
            <Text style={styles.sectionTitle}>Required Permissions</Text>

            {permissionsList.map((permission, index) => (
              <View key={index} style={styles.permissionItem}>
                <View style={styles.permissionIcon}>
                  <Ionicons name={permission.icon} size={24} color="#3b82f6" />
                </View>

                <View style={styles.permissionInfo}>
                  <Text style={styles.permissionName}>{permission.name}</Text>
                  <Text style={styles.permissionDescription}>
                    {permission.description}
                  </Text>
                  {!permission.granted && !permission.canAskAgain && (
                    <Text style={styles.permissionNote}>
                      Enable manually in Settings
                    </Text>
                  )}
                </View>

                <View style={styles.permissionStatus}>
                  <Ionicons
                    name={getPermissionStatusIcon(permission)}
                    size={20}
                    color={getPermissionStatusColor(permission)}
                  />
                  <Text
                    style={[
                      styles.permissionStatusText,
                      { color: getPermissionStatusColor(permission) },
                    ]}
                  >
                    {permission.granted
                      ? "Granted"
                      : !permission.canAskAgain
                        ? "Denied"
                        : "Needed"}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Help Text */}
          <View style={styles.helpSection}>
            <Text style={styles.helpTitle}>Why are these needed?</Text>
            <View style={styles.helpItem}>
              <Ionicons name="location" size={16} color="#6b7280" />
              <Text style={styles.helpText}>
                Location: Track your route, calculate distance, and provide
                GPS-based metrics
              </Text>
            </View>
            <View style={styles.helpItem}>
              <Ionicons name="bluetooth" size={16} color="#6b7280" />
              <Text style={styles.helpText}>
                Bluetooth: Connect to heart rate monitors, power meters, and
                other fitness sensors
              </Text>
            </View>
            <View style={styles.helpItem}>
              <Ionicons name="fitness" size={16} color="#6b7280" />
              <Text style={styles.helpText}>
                Motion & Fitness: Detect activity and calculate calories burned
                during your activity
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Footer Actions */}
        <View style={styles.footer}>
          {permanentlyDeniedPermissions.length > 0 ? (
            <Button
              style={styles.settingsButton}
              onPress={handleOpenSettings}
            >
              <Ionicons name="settings-outline" size={20} color="#3b82f6" />
              <Text style={styles.settingsButtonText}>Open Settings</Text>
            </Button>
          ) : deniedPermissions.length > 0 ? (
            <Button
              style={[
                styles.requestButton,
                isRequesting && styles.requestButtonDisabled,
              ]}
              onPress={handleRequestPermissions}
              disabled={isRequesting}
            >
              {isRequesting ? (
                <Text style={styles.requestButtonText}>Requesting...</Text>
              ) : (
                <>
                  <Ionicons name="shield-checkmark" size={20} color="#ffffff" />
                  <Text style={styles.requestButtonText}>
                    Grant Permissions
                  </Text>
                </>
              )}
            </Button>
          ) : (
            <Button style={styles.successButton} onPress={onClose}>
              <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
              <Text style={styles.successButtonText}>All Set!</Text>
            </Button>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
    marginBottom: 24,
  },
  statusText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 12,
  },
  permissionsList: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
  },
  permissionItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  permissionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  permissionInfo: {
    flex: 1,
  },
  permissionName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  permissionDescription: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 20,
  },
  permissionNote: {
    fontSize: 12,
    color: "#ef4444",
    fontWeight: "500",
    marginTop: 4,
  },
  permissionStatus: {
    alignItems: "center",
    marginLeft: 12,
  },
  permissionStatusText: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  helpSection: {
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  helpItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  helpText: {
    fontSize: 14,
    color: "#6b7280",
    marginLeft: 8,
    lineHeight: 20,
    flex: 1,
  },
  footer: {
    padding: 20,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  requestButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3b82f6",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  requestButtonDisabled: {
    backgroundColor: "#9ca3af",
  },
  requestButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  settingsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#3b82f6",
    gap: 8,
  },
  settingsButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#3b82f6",
  },
  successButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10b981",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  successButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
});
