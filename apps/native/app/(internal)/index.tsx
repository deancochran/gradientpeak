import React from 'react';
import { Animated, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedView } from '@/components/ThemedView';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

export default function HomeScreen() {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  // Mock stats (replace with dynamic data)
  const stats = [
    { id: 'activities', label: 'Activities', value: 0 },
    { id: 'distance', label: 'Distance', value: '0 km' },
    { id: 'duration', label: 'Duration', value: '0h' },
  ];

  return (
    <ThemedView style={styles.container} testID="dashboard-screen">
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        testID="dashboard-scroll-view"
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Header */}
          <View style={styles.mainContent}>
            <Text style={styles.centeredText} testID="dashboard-title">Dashboard</Text>
          </View>

          {/* Stats Cards */}
          <View style={styles.statsContainer} testID="stats-container">
            {stats.map((stat, idx) => (
              <Animated.View
                key={stat.id}
                style={{ opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [20 * (idx + 1), 0] }) }] }}
              >
                <Card style={styles.statCard} testID={`${stat.id}-stat-card`}>
                  <Text style={styles.statNumber}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </Card>
              </Animated.View>
            ))}
          </View>

          {/* Recent Activities */}
          <View style={styles.sectionContainer} testID="activities-section">
            <Text style={styles.sectionTitle} testID="activities-list-title">Your Activities</Text>
            <Card style={styles.emptyStateCard} testID="empty-activities-state">
              <Text style={styles.emptyStateText}>No activities yet</Text>
              <Text style={styles.emptyStateSubtext}>Start recording your first workout!</Text>
            </Card>
          </View>
        </Animated.View>
      </ScrollView>


    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 120 },
  mainContent: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  centeredText: { fontSize: 32, fontWeight: '700', color: '#000', textAlign: 'center' },
  statsContainer: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  statCard: { flex: 1, padding: 16, alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  statNumber: { fontSize: 24, fontWeight: '700', color: '#000', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#444', fontWeight: '500' },
  sectionContainer: { marginBottom: 24 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#000', marginBottom: 16 },
  emptyStateCard: { padding: 32, alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#ccc', borderStyle: 'dashed' },
  emptyStateText: { fontSize: 16, fontWeight: '600', color: '#000', marginBottom: 8 },
  emptyStateSubtext: { fontSize: 14, color: '#666', textAlign: 'center' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', padding: 20, paddingBottom: 90, borderTopWidth: 1, borderTopColor: '#e5e5e5', shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 4 },
  footerButton: { height: 48, backgroundColor: '#000', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  footerButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
;