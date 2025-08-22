import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { SignOutButton } from '@/components/SignOutButton';
import { ThemedView } from '@/components/ThemedView';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

export default function SettingsScreen() {
  // Mock user data (would come from authentication/database in real app)
  const userData = {
    name: 'John Doe',
    email: 'john.doe@example.com',
    joinDate: 'January 2025',
    avatar: null, // Would be actual avatar URL
  };

  // Mock activity stats
  const activityStats = {
    totalActivities: 24,
    totalDistance: 156.8,
    totalTime: '24h 32m',
    favoriteActivity: 'Running',
  };

  // Recent workouts
  const recentWorkouts = [
    {
      id: 1,
      name: 'Morning Run',
      date: '2 days ago',
      type: 'running',
      distance: '5.2 km',
      duration: '28:45',
    },
    {
      id: 2,
      name: 'Evening Bike Ride',
      date: '4 days ago',
      type: 'cycling',
      distance: '15.8 km',
      duration: '45:12',
    },
    {
      id: 3,
      name: 'Park Walk',
      date: '1 week ago',
      type: 'walking',
      distance: '3.1 km',
      duration: '42:30',
    },
  ];

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'running': return 'walk';
      case 'cycling': return 'bicycle';
      case 'walking': return 'walk';
      case 'swimming': return 'water';
      default: return 'fitness';
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* User Profile Section */}
        <Card style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.avatarContainer}>
              {userData.avatar ? (
                <Image source={{ uri: userData.avatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={32} color="#9ca3af" />
                </View>
              )}
            </View>
            
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{userData.name}</Text>
              <Text style={styles.userEmail}>{userData.email}</Text>
              <Text style={styles.joinDate}>Member since {userData.joinDate}</Text>
            </View>

            <TouchableOpacity style={styles.editButton}>
              <Ionicons name="pencil" size={20} color="#667eea" />
            </TouchableOpacity>
          </View>
        </Card>

        {/* Activity Stats */}
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>Activity Overview</Text>
          <View style={styles.statsGrid}>
            <Card style={styles.statCard}>
              <Text style={styles.statNumber}>{activityStats.totalActivities}</Text>
              <Text style={styles.statLabel}>Activities</Text>
            </Card>
            
            <Card style={styles.statCard}>
              <Text style={styles.statNumber}>{activityStats.totalDistance} km</Text>
              <Text style={styles.statLabel}>Distance</Text>
            </Card>
            
            <Card style={styles.statCard}>
              <Text style={styles.statNumber}>{activityStats.totalTime}</Text>
              <Text style={styles.statLabel}>Total Time</Text>
            </Card>
            
            <Card style={styles.statCard}>
              <Text style={styles.statNumber}>{activityStats.favoriteActivity}</Text>
              <Text style={styles.statLabel}>Favorite</Text>
            </Card>
          </View>
        </View>

        {/* Previous Workouts Section */}
        <View style={styles.workoutsSection}>
          <Text style={styles.sectionTitle}>Previous Workouts</Text>
          
          {recentWorkouts.map((workout) => (
            <Card key={workout.id} style={styles.workoutCard}>
              <View style={styles.workoutHeader}>
                <View style={styles.workoutIcon}>
                  <Ionicons 
                    name={getActivityIcon(workout.type) as any} 
                    size={20} 
                    color="#667eea" 
                  />
                </View>
                
                <View style={styles.workoutInfo}>
                  <Text style={styles.workoutName}>{workout.name}</Text>
                  <Text style={styles.workoutDate}>{workout.date}</Text>
                </View>
                
                <View style={styles.workoutStats}>
                  <Text style={styles.workoutDistance}>{workout.distance}</Text>
                  <Text style={styles.workoutDuration}>{workout.duration}</Text>
                </View>
              </View>
            </Card>
          ))}
          
          <Button 
            variant="outline" 
            style={styles.viewAllButton}
            onPress={() => {}}
          >
            <Text style={styles.viewAllButtonText}>View All Activities</Text>
          </Button>
        </View>

        {/* Settings Options */}
        <View style={styles.settingsSection}>
          <Text style={styles.sectionTitle}>Settings</Text>
          
          <Card style={styles.settingsCard}>
            <TouchableOpacity style={styles.settingItem}>
              <View style={styles.settingIcon}>
                <Ionicons name="notifications-outline" size={20} color="#667eea" />
              </View>
              <Text style={styles.settingText}>Notifications</Text>
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
            </TouchableOpacity>
            
            <View style={styles.settingDivider} />
            
            <TouchableOpacity style={styles.settingItem}>
              <View style={styles.settingIcon}>
                <Ionicons name="location-outline" size={20} color="#667eea" />
              </View>
              <Text style={styles.settingText}>Privacy & Location</Text>
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
            </TouchableOpacity>
            
            <View style={styles.settingDivider} />
            
            <TouchableOpacity style={styles.settingItem}>
              <View style={styles.settingIcon}>
                <Ionicons name="speedometer-outline" size={20} color="#667eea" />
              </View>
              <Text style={styles.settingText}>Units & Measurements</Text>
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
            </TouchableOpacity>
            
            <View style={styles.settingDivider} />
            
            <TouchableOpacity style={styles.settingItem}>
              <View style={styles.settingIcon}>
                <Ionicons name="help-circle-outline" size={20} color="#667eea" />
              </View>
              <Text style={styles.settingText}>Help & Support</Text>
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
            </TouchableOpacity>
          </Card>
        </View>

        {/* Sign Out Button */}
        <View style={styles.signOutSection}>
          <SignOutButton />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 100, // Space for tab bar
  },
  profileCard: {
    padding: 20,
    marginBottom: 24,
    backgroundColor: 'white',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
    gap: 4,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  userEmail: {
    fontSize: 14,
    color: '#6b7280',
  },
  joinDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    padding: 16,
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#667eea',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  workoutsSection: {
    marginBottom: 24,
  },
  workoutCard: {
    padding: 16,
    marginBottom: 12,
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  workoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  workoutIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f4ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutInfo: {
    flex: 1,
    gap: 2,
  },
  workoutName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  workoutDate: {
    fontSize: 12,
    color: '#6b7280',
  },
  workoutStats: {
    alignItems: 'flex-end',
    gap: 2,
  },
  workoutDistance: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  workoutDuration: {
    fontSize: 12,
    color: '#6b7280',
  },
  viewAllButton: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginTop: 8,
  },
  viewAllButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  settingsSection: {
    marginBottom: 24,
  },
  settingsCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
  },
  settingIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f4ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  settingDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginLeft: 68,
  },
  signOutSection: {
    marginBottom: 24,
  },
  signOutButton: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
  },
  signOutButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc2626',
  },
});
