import { Ionicons } from "@expo/vector-icons";
import { SelectLocalActivity } from "@lib/db/schemas";
import { useActivityManager } from "@lib/hooks/useActivityManager";
import { ActivityService } from "@lib/services/activity-service";
import { ProfileService } from "@lib/services/profile-service";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ActivitiesScreen() {
  const {
    activities,
    isLoading,
    error,
    syncStatus,
    isSyncing,
    loadActivities,
    deleteActivity,
    syncActivity,
    syncAllActivities,
    clearError,
  } = useActivityManager();

  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    console.log("📋 Activities Screen - Initializing");
    initializeScreen();
  }, []);

  const initializeScreen = async () => {
    try {
      const profile = await ProfileService.getCurrentProfile();
      if (profile) {
        setProfileId(profile.id);
        console.log("📋 Activities Screen - Profile loaded:", profile.id);
        await loadActivities(profile.id);
      }
    } catch (error) {
      console.error("📋 Activities Screen - Initialization error:", error);
    }
  };

  const handleRefresh = useCallback(async () => {
    console.log("📋 Activities Screen - Refreshing");
    if (profileId) {
      await loadActivities(profileId);
    }
  }, [profileId, loadActivities]);

  const handleSyncAll = useCallback(async () => {
    console.log("📋 Activities Screen - Syncing all activities");
    const result = await syncAllActivities();
    Alert.alert(
      "Sync Complete",
      `Successfully synced: ${result.success}\nFailed: ${result.failed}`,
    );
  }, [syncAllActivities]);

  const handleDeleteActivity = useCallback(
    async (activityId: string) => {
      Alert.alert(
        "Delete Activity",
        "Are you sure you want to delete this activity? This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              console.log(
                "📋 Activities Screen - Deleting activity:",
                activityId,
              );
              const success = await deleteActivity(activityId);
              if (success) {
                Alert.alert("Success", "Activity deleted successfully");
              }
            },
          },
        ],
      );
    },
    [deleteActivity],
  );

  const renderActivity = ({ item }: { item: SelectLocalActivity }) => (
    <TouchableOpacity style={styles.activityCard}>
      <View style={styles.activityHeader}>
        <View style={styles.activityInfo}>
          <Text style={styles.activityTitle}>
            {item.sport_type || "Activity"}
          </Text>
          <Text style={styles.activityDate}>
            {new Date(item.startTime).toLocaleDateString()}
          </Text>
        </View>
        <View style={styles.syncStatusContainer}>
          <View
            style={[
              styles.syncIndicator,
              { backgroundColor: getSyncStatusColor(item.sync_status) },
            ]}
          />
          <Text style={styles.syncStatusText}>
            {getSyncStatusLabel(item.sync_status)}
          </Text>
        </View>
      </View>

      <View style={styles.activityMetrics}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Duration</Text>
          <Text style={styles.metricValue}>
            {ActivityService.formatDuration(item.elapsedTime || 0)}
          </Text>
        </View>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Distance</Text>
          <Text style={styles.metricValue}>
            {ActivityService.formatDistance(item.distance || 0)}
          </Text>
        </View>
      </View>

      <View style={styles.activityActions}>
        {item.sync_status === "local_only" && (
          <TouchableOpacity
            onPress={() => {
              console.log("📋 Activities Screen - Syncing activity:", item.id);
              syncActivity(item.id);
            }}
            style={styles.syncButton}
          >
            <Ionicons name="cloud-upload" size={16} color="#3b82f6" />
            <Text style={styles.syncButtonText}>Sync</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => handleDeleteActivity(item.id)}
          style={styles.deleteButton}
        >
          <Ionicons name="trash" size={16} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const getSyncStatusColor = (status: string) => {
    switch (status) {
      case "synced":
        return "#10b981";
      case "syncing":
        return "#f59e0b";
      case "sync_failed":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  const getSyncStatusLabel = (status: string) => {
    switch (status) {
      case "synced":
        return "Synced";
      case "syncing":
        return "Syncing...";
      case "sync_failed":
        return "Failed";
      default:
        return "Local";
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Activities</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={handleSyncAll}
            disabled={isSyncing}
            style={[styles.syncAllButton, isSyncing && styles.buttonDisabled]}
          >
            <Ionicons name="sync" size={20} color="#3b82f6" />
            <Text style={styles.syncAllButtonText}>
              {isSyncing ? "Syncing..." : "Sync All"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Sync Status Summary */}
      <View style={styles.syncSummary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{syncStatus.totalActivities}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {syncStatus.pendingActivities}
          </Text>
          <Text style={styles.summaryLabel}>Pending</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{syncStatus.failedActivities}</Text>
          <Text style={styles.summaryLabel}>Failed</Text>
        </View>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={clearError} style={styles.errorDismiss}>
            <Ionicons name="close" size={16} color="#ef4444" />
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={activities}
        keyExtractor={(item) => item.id}
        renderItem={renderActivity}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} />
        }
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="bicycle" size={64} color="#9ca3af" />
            <Text style={styles.emptyTitle}>No Activities Yet</Text>
            <Text style={styles.emptySubtitle}>
              Start recording your first activity!
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#111827",
  },
  headerActions: {
    flexDirection: "row",
  },
  syncAllButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#f0f9ff",
    borderRadius: 6,
  },
  syncAllButtonText: {
    marginLeft: 4,
    fontSize: 14,
    color: "#3b82f6",
    fontWeight: "500",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  syncSummary: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    marginHorizontal: 20,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#111827",
  },
  summaryLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  },
  errorContainer: {
    flexDirection: "row",
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: "#dc2626",
  },
  errorDismiss: {
    padding: 2,
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  activityCard: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  activityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  activityInfo: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  activityDate: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 2,
  },
  syncStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  syncIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  syncStatusText: {
    fontSize: 12,
    color: "#6b7280",
  },
  activityMetrics: {
    flexDirection: "row",
    marginBottom: 12,
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 12,
    color: "#6b7280",
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "500",
    color: "#111827",
    marginTop: 2,
  },
  activityActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#f0f9ff",
    borderRadius: 4,
  },
  syncButtonText: {
    marginLeft: 4,
    fontSize: 12,
    color: "#3b82f6",
  },
  deleteButton: {
    padding: 4,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 64,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 8,
  },
});
