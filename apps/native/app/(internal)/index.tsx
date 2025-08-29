// apps/native/app/(internal)/index.tsx
import React, { useEffect, useState } from "react";
import {
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/contexts";
import {
  activities,
  formatDistance,
  formatDuration,
  profiles,
} from "@/lib/supabase";

interface UserStats {
  totalActivities: number;
  totalDistance: number;
  totalDuration: number;
  activitiesBySport: Record<string, number>;
}

interface UserProfile {
  full_name?: string;
  preferred_units?: "metric" | "imperial";
}

export default function HomeScreen() {
  const { session } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(30)).current;

  const loadData = async (showRefresh = false) => {
    if (!session?.user?.id) return;

    try {
      if (showRefresh) setRefreshing(true);
      else setLoading(true);

      console.log("📊 Loading user data for home screen");

      // Load user profile and stats in parallel
      const [profileResult, statsResult] = await Promise.all([
        profiles.getProfile(session.user.id),
        activities.getActivityStats(session.user.id),
      ]);

      if (profileResult.error) {
        console.error("❌ Error loading profile:", profileResult.error);
      } else {
        setProfile(profileResult.data);
        console.log("👤 Profile loaded:", profileResult.data);
      }

      if (statsResult.error) {
        console.error("❌ Error loading stats:", statsResult.error);
      } else {
        setStats(statsResult.data);
        console.log("📈 Stats loaded:", statsResult.data);
      }
    } catch (error) {
      console.error("❌ Unexpected error loading home data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    loadData(true);
  };

  useEffect(() => {
    // Load data on mount
    loadData();

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
  }, [session?.user?.id]);

  // Get display name
  const displayName =
    profile?.full_name || session?.user?.email?.split("@")[0] || "User";
  const units = profile?.preferred_units || "metric";

  // Prepare stats for display
  const displayStats = [
    {
      id: "activities",
      label: "Activities",
      value: stats?.totalActivities?.toString() || "0",
    },
    {
      id: "distance",
      label: "Distance",
      value: stats ? formatDistance(stats.totalDistance, units) : "0 km",
    },
    {
      id: "duration",
      label: "Duration",
      value: stats ? formatDuration(stats.totalDuration) : "0:00",
    },
  ];

  return (
    <ThemedView style={styles.container} testID="dashboard-screen">
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#666"
          />
        }
        testID="dashboard-scroll-view"
      >
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        >
          {/* Header with personalized greeting */}
          <View style={styles.mainContent}>
            <Text style={styles.greeting} testID="dashboard-greeting">
              Welcome back,
            </Text>
            <Text style={styles.userName} testID="dashboard-username">
              {displayName}
            </Text>
          </View>

          {/* Stats Cards */}
          <View style={styles.statsContainer} testID="stats-container">
            {displayStats.map((stat, idx) => (
              <Animated.View
                key={stat.id}
                style={{
                  opacity: fadeAnim,
                  transform: [
                    {
                      translateY: fadeAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [20 * (idx + 1), 0],
                      }),
                    },
                  ],
                }}
              >
                <Card style={styles.statCard} testID={`${stat.id}-stat-card`}>
                  <Text style={styles.statNumber}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </Card>
              </Animated.View>
            ))}
          </View>

          {/* Sport breakdown if user has activities */}
          {stats && stats.totalActivities > 0 && (
            <View style={styles.sectionContainer} testID="sports-section">
              <Text style={styles.sectionTitle} testID="sports-title">
                Activity Breakdown
              </Text>
              <Card
                style={styles.sportBreakdownCard}
                testID="sport-breakdown-card"
              >
                {Object.entries(stats.activitiesBySport).map(
                  ([sport, count]) => (
                    <View
                      key={sport}
                      style={styles.sportItem}
                      testID={`sport-${sport}`}
                    >
                      <Text style={styles.sportName}>
                        {sport.charAt(0).toUpperCase() + sport.slice(1)}
                      </Text>
                      <Text style={styles.sportCount}>{count}</Text>
                    </View>
                  ),
                )}
              </Card>
            </View>
          )}

          {/* Recent Activities */}
          <View style={styles.sectionContainer} testID="activities-section">
            <Text style={styles.sectionTitle} testID="activities-list-title">
              Your Activities
            </Text>
            {!stats || stats.totalActivities === 0 ? (
              <Card
                style={styles.emptyStateCard}
                testID="empty-activities-state"
              >
                <Text style={styles.emptyStateText}>No activities yet</Text>
                <Text style={styles.emptyStateSubtext}>
                  Start recording your first workout!
                </Text>
              </Card>
            ) : (
              <Card style={styles.summaryCard} testID="activities-summary">
                <Text style={styles.summaryText}>
                  You`&apos;'ve completed {stats.totalActivities} activities
                </Text>
                <Text style={styles.summarySubtext}>
                  Tap `&apos;"Record`&apos;" to add your next workout
                </Text>
              </Card>
            )}
          </View>

          {/* Debug info in development */}
          {__DEV__ && (
            <View style={styles.debugContainer} testID="debug-info">
              <Text style={styles.debugTitle}>Debug Info</Text>
              <Text style={styles.debugText}>
                User ID: {session?.user?.id || "None"}
              </Text>
              <Text style={styles.debugText}>
                Email: {session?.user?.email || "None"}
              </Text>
              <Text style={styles.debugText}>
                Verified: {session?.user?.email_confirmed_at ? "Yes" : "No"}
              </Text>
              <Text style={styles.debugText}>
                Stats loaded: {stats ? "Yes" : "No"}
              </Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
  },
  mainContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
  greeting: {
    fontSize: 18,
    color: "#666",
    textAlign: "center",
    marginBottom: 4,
  },
  userName: {
    fontSize: 28,
    fontWeight: "700",
    color: "#000",
    textAlign: "center",
  },
  statsContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 32,
  },
  statCard: {
    flex: 1,
    padding: 16,
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "700",
    color: "#000",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#444",
    fontWeight: "500",
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#000",
    marginBottom: 16,
  },
  emptyStateCard: {
    padding: 32,
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ccc",
    borderStyle: "dashed",
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  summaryCard: {
    padding: 24,
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  summaryText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    marginBottom: 4,
    textAlign: "center",
  },
  summarySubtext: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  sportBreakdownCard: {
    padding: 20,
    backgroundColor: "#fff",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sportItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  sportName: {
    fontSize: 16,
    color: "#000",
    fontWeight: "500",
  },
  sportCount: {
    fontSize: 16,
    color: "#666",
    fontWeight: "600",
  },
  debugContainer: {
    marginTop: 24,
    padding: 16,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dee2e6",
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#495057",
    marginBottom: 8,
  },
  debugText: {
    fontSize: 12,
    color: "#6c757d",
    marginBottom: 2,
    fontFamily: "monospace",
  },
});
