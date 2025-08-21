import React from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';

import { ThemedView } from '@/components/ThemedView';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container} testID="dashboard-screen">
      {/* Content Area */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        testID="dashboard-scroll-view"
      >
        {/* Main Content */}
        <View style={styles.mainContent}>
          <Text style={styles.centeredText} testID="dashboard-title">Dashboard</Text>
        </View>

        {/* Quick Stats Cards */}
        <View style={styles.statsContainer} testID="stats-container">
          <Card style={styles.statCard} testID="activities-stat-card">
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Activities</Text>
          </Card>
          
          <Card style={styles.statCard} testID="distance-stat-card">
            <Text style={styles.statNumber}>0 km</Text>
            <Text style={styles.statLabel}>Distance</Text>
          </Card>
          
          <Card style={styles.statCard} testID="duration-stat-card">
            <Text style={styles.statNumber}>0h</Text>
            <Text style={styles.statLabel}>Duration</Text>
          </Card>
        </View>

        {/* Recent Activities Section */}
        <View style={styles.sectionContainer} testID="activities-section">
          <Text style={styles.sectionTitle} testID="activities-list-title">Your Activities</Text>
          <Card style={styles.emptyStateCard} testID="empty-activities-state">
            <Text style={styles.emptyStateText}>No activities yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Start recording your first workout!
            </Text>
          </Card>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Button 
          variant="default" 
          style={styles.footerButton}
          onPress={() => {}}
          testID="record-activity-button"
          accessibilityLabel="Record new activity"
          accessibilityRole="button"
        >
          <Text style={styles.footerButtonText}>Record Activity</Text>
        </Button>
      </View>
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
    paddingBottom: 100, // Space for footer
  },
  mainContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  centeredText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#374151',
    textAlign: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  statCard: {
    flex: 1,
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
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  emptyStateCard: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    padding: 20,
    paddingBottom: 90, // Space for tab bar
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
  },
  footerButton: {
    height: 48,
    backgroundColor: '#667eea',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});