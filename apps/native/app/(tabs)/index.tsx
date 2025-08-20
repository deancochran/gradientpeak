// apps/native/app/(tabs)/index.tsx
import { useAuth, useUser } from "@clerk/clerk-expo";
import * as React from "react";
import {
    Alert,
    RefreshControl,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import {
    Activity,
    createAuthenticatedApi,
    formatDistance,
    formatDuration,
    UserSettings,
    useSupabaseClient,
} from "@/lib/supabase";

interface UserStats {
  totalActivities: number;
  totalDistance: number;
  totalDuration: number;
  activitiesByType: Record<string, number>;
}

export default function HomeScreen() {
  const { user: clerkUser } = useUser();
  const { getAuthenticatedClient } = useSupabaseClient();

  const [stats, setStats] = React.useState<UserStats | null>(null);
  const [recentActivities, setRecentActivities] = React.useState<Activity[]>(
    [],
  );
  const [settings, setSettings] = React.useState<UserSettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadUserData = async () => {
    if (!clerkUser) return;

    try {
      setError(null);
      
      // DEBUG: Test JWT token
      console.log('🔍 Debug: Clerk User ID:', clerkUser.id);
      
      // Get authenticated Supabase client
      const supabaseClient = await getAuthenticatedClient();
      const api = createAuthenticatedApi(supabaseClient);
      
      // DEBUG: Test simple query first
      console.log('🔍 Debug: Testing simple query...');
      const { data: testData, error: testError } = await supabaseClient
        .from('users')
        .select('id, clerk_user_id')
        .limit(1);
        
      if (testError) {
        console.log('🚨 Debug: Simple query failed:', testError);
        throw new Error(`Database connection failed: ${testError.message}`);
      }
      
      console.log('✅ Debug: Simple query succeeded:', testData);
      
      // Get or create user in Supabase
      let user = await api.getUser(clerkUser.id);
      if (!user) {
        user = await api.createUser({
          clerk_user_id: clerkUser.id,
          email: clerkUser.emailAddresses[0]?.emailAddress || "",
          full_name: clerkUser.fullName,
          avatar_url: clerkUser.imageUrl,
        });
      }

      // Load user settings
      try {
        const userSettings = await api.getUserSettings(user.id);
        setSettings(userSettings);
      } catch {
        // Create default settings if none exist
        const defaultSettings: UserSettings = {
          id: "temp-id",
          user_id: user.id,
          preferred_units: "metric",
          timezone: "UTC",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setSettings(defaultSettings);
      }

      // Load activity stats and recent activities
      const [userStats, activities] = await Promise.all([
        api.getActivityStats(user.id),
        api.getActivities(user.id, 5),
      ]);
      
      setStats(userStats);
      setRecentActivities(activities);

    } catch (err) {
      console.error("Error loading user data:", err);
      
      // More detailed error handling
      let errorMessage = "Failed to load user data";
      if (err instanceof Error) {
        if (err.message.includes("Network request failed")) {
          errorMessage = "Cannot connect to server. Check your network connection.";
        } else if (err.message.includes("JWT")) {
          errorMessage = "Authentication error. Please sign in again.";
        } else {
          errorMessage = `Error: ${err.message}`;
        }
      }
      
      setError(errorMessage);
      Alert.alert("Error", errorMessage);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUserData();
    setRefreshing(false);
  };

  React.useEffect(() => {
    const initData = async () => {
      setLoading(true);
      await loadUserData();
      setLoading(false);
    };

    initData();
  }, [clerkUser, loadUserData]);

  if (loading) {
    return (
      <ThemedView style={styles.screen}>
        <View style={styles.loadingContainer}>
          <ThemedText>Loading your dashboard...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.screen}>
        <Card style={styles.errorCard}>
          <Text variant="title" style={styles.errorTitle}>
            Oops!
          </Text>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <Button onPress={onRefresh} style={styles.retryButton}>
            Try Again
          </Button>
        </Card>
      </ThemedView>
    );
  }

  const getActivityTypeIcon = (type: string) => {
    switch (type) {
      case "running":
        return "🏃‍♂️";
      case "cycling":
        return "🚴‍♂️";
      case "walking":
        return "🚶‍♂️";
      case "hiking":
        return "🥾";
      case "swimming":
        return "🏊‍♂️";
      default:
        return "🏃‍♂️";
    }
  };

  const getMostFrequentActivity = () => {
    if (
      !stats?.activitiesByType ||
      Object.keys(stats.activitiesByType).length === 0
    ) {
      return "running";
    }

    return Object.entries(stats.activitiesByType).reduce((a, b) =>
      stats.activitiesByType[a[0]] > stats.activitiesByType[b[0]] ? a : b,
    )[0];
  };

  return (
    <ThemedView style={styles.screen}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Welcome Header */}
        <Card style={styles.headerCard}>
          <View style={styles.headerContent}>
            <View>
              <Text variant="title" style={styles.welcomeTitle}>
                Welcome back, {clerkUser?.firstName || "Athlete"}!
              </Text>
              <ThemedText type="subtitle" style={styles.welcomeSubtitle}>
                Ready for your next adventure?
              </ThemedText>
            </View>
            <View style={styles.activityIcon}>
              <Text style={styles.iconEmoji}>
                {getActivityTypeIcon(getMostFrequentActivity())}
              </Text>
            </View>
          </View>
        </Card>

        {/* Stats Overview */}
        <View style={styles.statsContainer}>
          <Card style={styles.statCard}>
            <Text style={styles.statNumber}>{stats?.totalActivities || 0}</Text>
            <ThemedText style={styles.statLabel}>Activities</ThemedText>
          </Card>

          <Card style={styles.statCard}>
            <Text style={styles.statNumber}>
              {formatDistance(stats?.totalDistance || 0, settings?.units)}
            </Text>
            <ThemedText style={styles.statLabel}>Distance</ThemedText>
          </Card>

          <Card style={styles.statCard}>
            <Text style={styles.statNumber}>
              {formatDuration(stats?.totalDuration || 0)}
            </Text>
            <ThemedText style={styles.statLabel}>Time</ThemedText>
          </Card>
        </View>

        {/* Activity Breakdown */}
        {stats?.activitiesByType &&
          Object.keys(stats.activitiesByType).length > 0 && (
            <Card style={styles.breakdownCard}>
              <Text style={styles.cardTitle}>Activity Breakdown</Text>
              <View style={styles.breakdownContent}>
                {Object.entries(stats.activitiesByType).map(([type, count]) => (
                  <View key={type} style={styles.breakdownItem}>
                    <View style={styles.breakdownLeft}>
                      <Text style={styles.breakdownIcon}>
                        {getActivityTypeIcon(type)}
                      </Text>
                      <ThemedText style={styles.breakdownType}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </ThemedText>
                    </View>
                    <Text style={styles.breakdownCount}>{count}</Text>
                  </View>
                ))}
              </View>
            </Card>
          )}

        {/* Recent Activities */}
        <Card style={styles.recentCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Recent Activities</Text>
            {recentActivities.length > 0 && (
              <Button style={styles.viewAllButton}>
                <Text style={styles.viewAllText}>View All</Text>
              </Button>
            )}
          </View>

          {recentActivities.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🏃‍♂️</Text>
              <ThemedText style={styles.emptyText}>
                No activities yet. Start your first workout!
              </ThemedText>
              <Button style={styles.startButton}>
                <Text style={styles.startButtonText}>Start Activity</Text>
              </Button>
            </View>
          ) : (
            <View style={styles.activitiesList}>
              {recentActivities.map((activity) => (
                <View key={activity.id} style={styles.activityItem}>
                  <View style={styles.activityLeft}>
                    <Text style={styles.activityIcon}>
                      {getActivityTypeIcon(activity.activity_type)}
                    </Text>
                    <View style={styles.activityDetails}>
                      <Text style={styles.activityTitle}>{activity.title}</Text>
                      <ThemedText style={styles.activityDate}>
                        {new Date(activity.started_at).toLocaleDateString()}
                      </ThemedText>
                    </View>
                  </View>
                  <View style={styles.activityRight}>
                    <Text style={styles.activityDistance}>
                      {formatDistance(activity.distance || 0, settings?.units)}
                    </Text>
                    <ThemedText style={styles.activityDuration}>
                      {formatDuration(activity.duration || 0)}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* Quick Actions */}
        <Card style={styles.quickActionsCard}>
          <Text style={styles.cardTitle}>Quick Actions</Text>
          <View style={styles.quickActions}>
            <Button style={styles.quickActionButton}>
              <Text style={styles.quickActionText}>🏃‍♂️ Start Run</Text>
            </Button>
            <Button style={styles.quickActionButton}>
              <Text style={styles.quickActionText}>🚴‍♂️ Start Ride</Text>
            </Button>
          </View>
        </Card>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  errorCard: {
    margin: 16,
    padding: 24,
    alignItems: "center",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  errorText: {
    textAlign: "center",
    marginBottom: 16,
    color: "#666",
  },
  retryButton: {
    paddingHorizontal: 24,
  },
  headerCard: {
    padding: 20,
    marginBottom: 16,
    borderRadius: 16,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: "#666",
  },
  activityIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(10,132,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  iconEmoji: {
    fontSize: 24,
  },
  statsContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    padding: 16,
    alignItems: "center",
    borderRadius: 12,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0a84ff",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    textTransform: "uppercase",
    fontWeight: "600",
  },
  breakdownCard: {
    padding: 16,
    marginBottom: 16,
    borderRadius: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  breakdownContent: {
    gap: 8,
  },
  breakdownItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  breakdownLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  breakdownIcon: {
    fontSize: 16,
  },
  breakdownType: {
    fontSize: 14,
  },
  breakdownCount: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0a84ff",
  },
  recentCard: {
    padding: 16,
    marginBottom: 16,
    borderRadius: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  viewAllButton: {
    backgroundColor: "transparent",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  viewAllText: {
    fontSize: 14,
    color: "#0a84ff",
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    textAlign: "center",
    color: "#666",
    marginBottom: 16,
  },
  startButton: {
    paddingHorizontal: 24,
  },
  startButtonText: {
    color: "white",
    fontWeight: "600",
  },
  activitiesList: {
    gap: 12,
  },
  activityItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  activityLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  activityIcon: {
    fontSize: 20,
  },
  activityDetails: {
    gap: 2,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  activityDate: {
    fontSize: 12,
    color: "#666",
  },
  activityRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  activityDistance: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0a84ff",
  },
  activityDuration: {
    fontSize: 12,
    color: "#666",
  },
  quickActionsCard: {
    padding: 16,
    borderRadius: 12,
  },
  quickActions: {
    flexDirection: "row",
    gap: 12,
  },
  quickActionButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: "rgba(10,132,255,0.1)",
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0a84ff",
  },
});
