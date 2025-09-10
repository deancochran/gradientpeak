import React, { useCallback, useEffect, useState } from "react";
import {
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

import { ThemedView } from "@components/ThemedView";
import { Card } from "@components/ui/card";
import { Text } from "@components/ui/text";
import { useAuth } from "@lib/contexts/AuthContext";
import { useActivityManager } from "@lib/hooks/useActivityManager";
import { usePerformanceMetrics } from "@lib/hooks/usePerformanceMetrics";
import { ProfileService } from "@lib/services/profile-service";
import { WorkoutService } from "@lib/services/workout-service";
import { Ionicons } from "@expo/vector-icons";
import type { Profile } from "@repo/core/schemas";
import { router } from "expo-router";

export default function HomeScreen() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Animations
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(30)).current;

  // Activity and performance data
  const {
    activities,
    syncStatus,
    loadActivities,
    isLoading: activitiesLoading,
  } = useActivityManager();

  const {
    metrics: performanceMetrics,
    refreshMetrics,
    isLoading: metricsLoading,
  } = usePerformanceMetrics();

  // Initialize screen
  useEffect(() => {
    console.log("🏠 Home Screen - Initializing");
    initializeHomeScreen();
  }, [session?.user?.id]);

  const initializeHomeScreen = async () => {
    try {
      setIsLoading(true);
      console.log("🏠 Home Screen - Loading user data");

      if (session?.user?.id) {
        // Load profile
        const currentProfile = await ProfileService.getCurrentProfile();
        if (currentProfile) {
          setProfile(currentProfile);
          console.log("🏠 Home Screen - Profile loaded:", {
            username: currentProfile.username,
            ftp: currentProfile.ftp,
            thresholdHr: currentProfile.thresholdHr,
          });

          // Load activities
          await loadActivities(currentProfile.id);
        }
      }

      // Animate entrance
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start();
    } catch (error) {
      console.error("🏠 Home Screen - Initialization error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    console.log("🏠 Home Screen - Refreshing");
    setRefreshing(true);

    try {
      if (profile) {
        await loadActivities(profile.id);
      }
      refreshMetrics();
    } catch (error) {
      console.error("🏠 Home Screen - Refresh error:", error);
    } finally {
      setRefreshing(false);
    }
  }, [profile, loadActivities, refreshMetrics]);

  const navigateToRecord = () => {
    console.log("🏠 Home Screen - Navigate to record");
    router.push("/(internal)/record");
  };

  const navigateToPlan = () => {
    console.log("🏠 Home Screen - Navigate to plan");
    router.push("/(internal)/plan");
  };

  const navigateToTrends = () => {
    console.log("🏠 Home Screen - Navigate to trends");
    router.push("/(internal)/trends");
  };

  const navigateToActivities = () => {
    console.log("🏠 Home Screen - Navigate to activities");
    router.push("/(internal)/activities");
  };

  // Calculate recent activity stats
  const recentActivities = activities.slice(0, 3);
  const totalActivities = activities.length;
  const totalDistance = activities.reduce(
    (sum, activity) => sum + (activity.distance || 0),
    0,
  );
  const totalDuration = activities.reduce(
    (sum, activity) => sum + (activity.elapsedTime || 0),
    0,
  );

  // Get display name
  const displayName =
    profile?.username || session?.user?.email?.split("@")[0] || "User";

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container} testID="home-screen">
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#3b82f6"
          />
        }
        testID="home-scroll-view"
      >
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting} testID="home-greeting">
                Welcome back,
              </Text>
              <Text style={styles.userName} testID="home-username">
                {displayName}
              </Text>
            </View>
            {profile && (
              <TouchableOpacity
                style={styles.profileButton}
                onPress={() => router.push("/(internal)/settings")}
              >
                <Ionicons name="person-circle" size={40} color="#3b82f6" />
              </TouchableOpacity>
            )}
          </View>

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.primaryAction}
              onPress={navigateToRecord}
            >
              <Ionicons name="add-circle" size={32} color="#ffffff" />
              <Text style={styles.primaryActionText}>Start Workout</Text>
            </TouchableOpacity>

            <View style={styles.secondaryActions}>
              <TouchableOpacity
                style={styles.secondaryAction}
                onPress={navigateToPlan}
              >
                <Ionicons name="calendar-outline" size={20} color="#3b82f6" />
                <Text style={styles.secondaryActionText}>Plan</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryAction}
                onPress={navigateToTrends}
              >
                <Ionicons
                  name="trending-up-outline"
                  size={20}
                  color="#3b82f6"
                />
                <Text style={styles.secondaryActionText}>Trends</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick Stats */}
          <View style={styles.statsContainer} testID="stats-container">
            <Text style={styles.sectionTitle}>Quick Stats</Text>
            <View style={styles.statsGrid}>
              <Card style={styles.statCard} testID="activities-stat-card">
                <Text style={styles.statNumber}>{totalActivities}</Text>
                <Text style={styles.statLabel}>Activities</Text>
              </Card>

              <Card style={styles.statCard} testID="distance-stat-card">
                <Text style={styles.statNumber}>
                  {WorkoutService.formatDistance(totalDistance)}
                </Text>
                <Text style={styles.statLabel}>Distance</Text>
              </Card>

              <Card style={styles.statCard} testID="duration-stat-card">
                <Text style={styles.statNumber}>
                  {WorkoutService.formatDuration(totalDuration)}
                </Text>
                <Text style={styles.statLabel}>Time</Text>
              </Card>

              <Card style={styles.statCard} testID="pending-stat-card">
                <Text style={styles.statNumber}>
                  {syncStatus.pendingActivities}
                </Text>
                <Text style={styles.statLabel}>Pending Sync</Text>
              </Card>
            </View>
          </View>

          {/* Performance Metrics */}
          {performanceMetrics && (
            <View style={styles.performanceSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Performance</Text>
                <TouchableOpacity onPress={navigateToTrends}>
                  <Text style={styles.seeAllText}>See All</Text>
                </TouchableOpacity>
              </View>

              <Card style={styles.performanceCard}>
                <View style={styles.performanceRow}>
                  <View style={styles.performanceMetric}>
                    <Text style={styles.performanceValue}>
                      {performanceMetrics.currentCTL.toFixed(1)}
                    </Text>
                    <Text style={styles.performanceLabel}>CTL</Text>
                    <Text style={styles.performanceSubLabel}>Fitness</Text>
                  </View>

                  <View style={styles.performanceMetric}>
                    <Text style={styles.performanceValue}>
                      {performanceMetrics.currentATL.toFixed(1)}
                    </Text>
                    <Text style={styles.performanceLabel}>ATL</Text>
                    <Text style={styles.performanceSubLabel}>Fatigue</Text>
                  </View>

                  <View style={styles.performanceMetric}>
                    <Text
                      style={[
                        styles.performanceValue,
                        {
                          color:
                            performanceMetrics.currentTSB > 0
                              ? "#10b981"
                              : "#ef4444",
                        },
                      ]}
                    >
                      {performanceMetrics.currentTSB > 0 ? "+" : ""}
                      {performanceMetrics.currentTSB.toFixed(1)}
                    </Text>
                    <Text style={styles.performanceLabel}>TSB</Text>
                    <Text style={styles.performanceSubLabel}>Form</Text>
                  </View>
                </View>

                <View style={styles.formIndicator}>
                  <Text style={styles.formLabel}>Current Form: </Text>
                  <Text
                    style={[
                      styles.formValue,
                      { color: getFormColor(performanceMetrics.form) },
                    ]}
                  >
                    {performanceMetrics.form.replace("_", " ").toUpperCase()}
                  </Text>
                </View>
              </Card>
            </View>
          )}

          {/* Recent Activities */}
          <View style={styles.recentSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Activities</Text>
              <TouchableOpacity onPress={navigateToActivities}>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>

            {recentActivities.length === 0 ? (
              <Card
                style={styles.emptyStateCard}
                testID="empty-activities-state"
              >
                <Ionicons name="bicycle" size={48} color="#9ca3af" />
                <Text style={styles.emptyStateText}>No activities yet</Text>
                <Text style={styles.emptyStateSubtext}>
                  Tap "Start Workout" to record your first activity!
                </Text>
              </Card>
            ) : (
              recentActivities.map((activity, index) => (
                <Animated.View
                  key={activity.id}
                  style={{
                    opacity: fadeAnim,
                    transform: [
                      {
                        translateY: fadeAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [20 * (index + 1), 0],
                        }),
                      },
                    ],
                  }}
                >
                  <Card
                    style={styles.activityCard}
                    testID={`activity-${activity.id}`}
                  >
                    <View style={styles.activityHeader}>
                      <View style={styles.activityIcon}>
                        <Ionicons
                          name={getActivityIcon(activity.sport_type)}
                          size={20}
                          color="#3b82f6"
                        />
                      </View>

                      <View style={styles.activityInfo}>
                        <Text style={styles.activityName}>
                          {activity.sport_type || "Activity"}
                        </Text>
                        <Text style={styles.activityDate}>
                          {new Date(activity.startTime).toLocaleDateString()}
                        </Text>
                      </View>

                      <View style={styles.activityStats}>
                        <Text style={styles.activityStat}>
                          {WorkoutService.formatDuration(
                            activity.elapsedTime || 0,
                          )}
                        </Text>
                        <Text style={styles.activityStat}>
                          {WorkoutService.formatDistance(
                            activity.distance || 0,
                          )}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.syncStatus,
                          {
                            backgroundColor: getSyncStatusColor(
                              activity.sync_status,
                            ),
                          },
                        ]}
                      />
                    </View>
                  </Card>
                </Animated.View>
              ))
            )}
          </View>

          {/* Profile Setup Reminder */}
          {!profile?.ftp && !profile?.thresholdHr && (
            <View style={styles.reminderSection}>
              <Card style={styles.reminderCard}>
                <View style={styles.reminderHeader}>
                  <Ionicons
                    name="information-circle"
                    size={24}
                    color="#f59e0b"
                  />
                  <Text style={styles.reminderTitle}>
                    Complete Your Profile
                  </Text>
                </View>
                <Text style={styles.reminderText}>
                  Set your FTP and threshold heart rate to get accurate training
                  metrics and zones.
                </Text>
                <TouchableOpacity
                  style={styles.reminderButton}
                  onPress={() => router.push("/(internal)/settings")}
                >
                  <Text style={styles.reminderButtonText}>Set Up Profile</Text>
                </TouchableOpacity>
              </Card>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </ThemedView>
  );
}

// Helper functions
const getFormColor = (form: string) => {
  switch (form) {
    case "optimal":
      return "#10b981";
    case "good":
      return "#3b82f6";
    case "tired":
      return "#f59e0b";
    case "very_tired":
      return "#ef4444";
    default:
      return "#6b7280";
  }
};

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

const getActivityIcon = (sportType: string): keyof typeof Ionicons.glyphMap => {
  switch (sportType?.toLowerCase()) {
    case "ride":
    case "cycling":
      return "bicycle";
    case "run":
    case "running":
      return "walk";
    case "swim":
    case "swimming":
      return "water";
    default:
      return "fitness";
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  greeting: {
    fontSize: 16,
    color: "#6b7280",
  },
  userName: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#111827",
    marginTop: 4,
  },
  profileButton: {
    padding: 4,
  },
  quickActions: {
    marginBottom: 32,
  },
  primaryAction: {
    backgroundColor: "#3b82f6",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    marginBottom: 12,
    shadowColor: "#3b82f6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  primaryActionText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 8,
  },
  secondaryActions: {
    flexDirection: "row",
    gap: 12,
  },
  secondaryAction: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  secondaryActionText: {
    color: "#3b82f6",
    fontSize: 14,
    fontWeight: "500",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  seeAllText: {
    fontSize: 14,
    color: "#3b82f6",
    fontWeight: "500",
  },
  statsContainer: {
    marginBottom: 32,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    padding: 16,
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#6b7280",
    textAlign: "center",
  },
  performanceSection: {
    marginBottom: 32,
  },
  performanceCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  performanceRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
  },
  performanceMetric: {
    alignItems: "center",
  },
  performanceValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 4,
  },
  performanceLabel: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  performanceSubLabel: {
    fontSize: 10,
    color: "#9ca3af",
  },
  formIndicator: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  formLabel: {
    fontSize: 14,
    color: "#6b7280",
  },
  formValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  recentSection: {
    marginBottom: 32,
  },
  emptyStateCard: {
    padding: 32,
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#6b7280",
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 4,
  },
  activityCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
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
    alignItems: "center",
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f0f9ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  activityInfo: {
    flex: 1,
  },
  activityName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  activityDate: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 2,
  },
  activityStats: {
    alignItems: "flex-end",
    marginRight: 12,
  },
  activityStat: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
  },
  syncStatus: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  reminderSection: {
    marginBottom: 32,
  },
  reminderCard: {
    backgroundColor: "#fffbeb",
    borderColor: "#fed7aa",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  reminderHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  reminderTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#92400e",
    marginLeft: 8,
  },
  reminderText: {
    fontSize: 14,
    color: "#a16207",
    marginBottom: 12,
    lineHeight: 20,
  },
  reminderButton: {
    backgroundColor: "#f59e0b",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: "flex-start",
  },
  reminderButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "500",
  },
});
