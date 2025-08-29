import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Animated,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

import { SignOutButton } from "@/components/SignOutButton";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";

export default function SettingsScreen() {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  const userData = {
    name: "John Doe",
    email: "john.doe@example.com",
    joinDate: "January 2025",
    avatar: null,
  };

  const activityStats = {
    totalActivities: 24,
    totalDistance: 156.8,
    totalTime: "24h 32m",
    favoriteActivity: "Running",
  };

  const recentWorkouts = [
    {
      id: 1,
      name: "Morning Run",
      date: "2 days ago",
      type: "running",
      distance: "5.2 km",
      duration: "28:45",
    },
    {
      id: 2,
      name: "Evening Bike Ride",
      date: "4 days ago",
      type: "cycling",
      distance: "15.8 km",
      duration: "45:12",
    },
    {
      id: 3,
      name: "Park Walk",
      date: "1 week ago",
      type: "walking",
      distance: "3.1 km",
      duration: "42:30",
    },
  ];

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "running":
        return "walk";
      case "cycling":
        return "bicycle";
      case "walking":
        return "walk";
      case "swimming":
        return "water";
      default:
        return "fitness";
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* User Profile */}
          <Card style={styles.profileCard} testID="profile-card">
            <View style={styles.profileHeader}>
              <View style={styles.avatarContainer}>
                {userData.avatar ? (
                  <Image
                    source={{ uri: userData.avatar }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Ionicons name="person" size={32} color="#222" />
                  </View>
                )}
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
              <TouchableOpacity
                style={styles.editButton}
                testID="edit-profile-btn"
              >
                <Ionicons name="pencil" size={20} color="#000" />
              </TouchableOpacity>
            </View>
          </Card>

          {/* Activity Stats */}
          <View style={styles.statsSection}>
            <Text style={styles.sectionTitle}>Activity Overview</Text>
            <View style={styles.statsGrid}>
              {Object.entries(activityStats).map(([key, value]) => (
                <Card key={key} style={styles.statCard}>
                  <Text style={styles.statNumber}>{value}</Text>
                  <Text style={styles.statLabel}>
                    {key.replace(/([A-Z])/g, " $1")}
                  </Text>
                </Card>
              ))}
            </View>
          </View>

          {/* Recent Workouts */}
          <View style={styles.workoutsSection}>
            <Text style={styles.sectionTitle}>Recent Workouts</Text>
            {recentWorkouts.map((workout, index) => (
              <Animated.View
                key={workout.id}
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
                  style={styles.workoutCard}
                  testID={`workout-${workout.id}`}
                >
                  <View style={styles.workoutHeader}>
                    <View style={styles.workoutIcon}>
                      <Ionicons
                        name={getActivityIcon(workout.type) as any}
                        size={20}
                        color="#000"
                      />
                    </View>
                    <View style={styles.workoutInfo}>
                      <Text style={styles.workoutName}>{workout.name}</Text>
                      <Text style={styles.workoutDate}>{workout.date}</Text>
                    </View>
                    <View style={styles.workoutStats}>
                      <Text style={styles.workoutDistance}>
                        {workout.distance}
                      </Text>
                      <Text style={styles.workoutDuration}>
                        {workout.duration}
                      </Text>
                    </View>
                  </View>
                </Card>
              </Animated.View>
            ))}
            <Button
              variant="outline"
              style={styles.viewAllButton}
              onPress={() => {}}
              testID="view-all-btn"
            >
              <Text style={styles.viewAllButtonText}>View All Activities</Text>
            </Button>
          </View>

          {/* Settings Options */}
          <View style={styles.settingsSection}>
            <Text style={styles.sectionTitle}>Settings</Text>
            <Card style={styles.settingsCard}>
              {[
                { icon: "notifications-outline", label: "Notifications" },
                { icon: "location-outline", label: "Privacy & Location" },
                { icon: "speedometer-outline", label: "Units & Measurements" },
                { icon: "help-circle-outline", label: "Help & Support" },
              ].map((item, idx) => (
                <React.Fragment key={item.label}>
                  <TouchableOpacity
                    style={styles.settingItem}
                    testID={`setting-${item.label}`}
                  >
                    <View style={styles.settingIcon}>
                      <Ionicons
                        name={item.icon as any}
                        size={20}
                        color="#000"
                      />
                    </View>
                    <Text style={styles.settingText}>{item.label}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#888" />
                  </TouchableOpacity>
                  {idx < 3 && <View style={styles.settingDivider} />}
                </React.Fragment>
              ))}
            </Card>
          </View>

          {/* Sign Out */}
          <View style={styles.signOutSection}>
            <SignOutButton />
          </View>
        </Animated.View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 100 },
  profileCard: {
    padding: 20,
    marginBottom: 24,
    backgroundColor: "#fff",
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  profileHeader: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatarContainer: { position: "relative" },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#e5e5e5",
    alignItems: "center",
    justifyContent: "center",
  },
  userInfo: { flex: 1, gap: 4 },
  userName: { fontSize: 20, fontWeight: "700", color: "#000" },
  userEmail: { fontSize: 14, color: "#333" },
  joinDate: { fontSize: 12, color: "#666" },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f2f2f2",
    alignItems: "center",
    justifyContent: "center",
  },
  statsSection: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#000",
    marginBottom: 16,
  },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: {
    flex: 1,
    minWidth: "45%",
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
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
    marginBottom: 4,
  },
  statLabel: { fontSize: 12, color: "#444", fontWeight: "500" },
  workoutsSection: { marginBottom: 24 },
  workoutCard: {
    padding: 16,
    marginBottom: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  workoutHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  workoutIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f2f2f2",
    alignItems: "center",
    justifyContent: "center",
  },
  workoutInfo: { flex: 1, gap: 2 },
  workoutName: { fontSize: 16, fontWeight: "600", color: "#000" },
  workoutDate: { fontSize: 12, color: "#666" },
  workoutStats: { alignItems: "flex-end", gap: 2 },
  workoutDistance: { fontSize: 14, fontWeight: "600", color: "#222" },
  workoutDuration: { fontSize: 12, color: "#666" },
  viewAllButton: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ccc",
    marginTop: 8,
  },
  viewAllButtonText: { fontSize: 14, fontWeight: "500", color: "#000" },
  settingsSection: { marginBottom: 24 },
  settingsCard: {
    backgroundColor: "#fff",
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
    backgroundColor: "#f2f2f2",
    alignItems: "center",
    justifyContent: "center",
  },
  settingText: { flex: 1, fontSize: 16, fontWeight: "500", color: "#000" },
  settingDivider: { height: 1, backgroundColor: "#e5e5e5", marginLeft: 68 },
  signOutSection: { marginBottom: 24 },
});
