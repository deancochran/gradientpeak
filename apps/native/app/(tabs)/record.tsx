import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedView } from '@/components/ThemedView';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

const { width: screenWidth } = Dimensions.get('window');

// Record Modal Component
function RecordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [selectedActivityType, setSelectedActivityType] = useState('running');
  const [currentPage, setCurrentPage] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const activityTypes = [
    { id: 'running', name: 'Running', icon: 'walk' },
    { id: 'cycling', name: 'Cycling', icon: 'bicycle' },
    { id: 'walking', name: 'Walking', icon: 'walk' },
    { id: 'swimming', name: 'Swimming', icon: 'water' },
    { id: 'other', name: 'Other', icon: 'fitness' },
  ];

  const workoutPages = [
    { title: 'Duration', value: '00:00', unit: 'min:sec' },
    { title: 'Distance', value: '0.0', unit: 'km' },
    { title: 'Pace', value: '0:00', unit: '/km' },
    { title: 'Heart Rate', value: '--', unit: 'bpm' },
    { title: 'Calories', value: '0', unit: 'kcal' },
  ];

  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      testID="record-modal"
    >
      <Animated.View style={[modalStyles.container, { opacity: fadeAnim }]} testID="record-modal-container">
        {/* Header */}
        <View style={modalStyles.header}>
          <TouchableOpacity
            style={modalStyles.closeButton}
            onPress={onClose}
            testID="record-modal-close-button"
            accessibilityLabel="Close record workout modal"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={24} color="#111827" />
          </TouchableOpacity>

          <Text style={modalStyles.headerTitle} testID="record-modal-title">Record Workout</Text>

          <TouchableOpacity
            style={modalStyles.activityTypeButton}
            testID="activity-type-selector"
            accessibilityLabel="Select activity type"
            accessibilityRole="button"
          >
            <Ionicons
              name={activityTypes.find(type => type.id === selectedActivityType)?.icon as any}
              size={20}
              color="#111827"
            />
            <Text style={modalStyles.activityTypeText}>
              {activityTypes.find(type => type.id === selectedActivityType)?.name}
            </Text>
            <Ionicons name="chevron-down" size={16} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        {/* Metrics */}
        <View style={modalStyles.content}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => {
              const pageIndex = Math.round(event.nativeEvent.contentOffset.x / event.nativeEvent.layoutMeasurement.width);
              setCurrentPage(pageIndex);
            }}
            style={modalStyles.metricsContainer}
          >
            {workoutPages.map((page, index) => (
              <Animated.View
                key={index}
                style={{
                  width: screenWidth,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 40,
                  opacity: fadeAnim,
                  transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [20 * (index + 1), 0] }) }],
                }}
              >
                <Card style={modalStyles.metricCard}>
                  <Text style={modalStyles.metricTitle}>{page.title}</Text>
                  <Text style={modalStyles.metricValue}>{page.value}</Text>
                  <Text style={modalStyles.metricUnit}>{page.unit}</Text>
                </Card>
              </Animated.View>
            ))}
          </ScrollView>

          <View style={modalStyles.pageIndicators}>
            {workoutPages.map((_, index) => (
              <View
                key={index}
                style={[
                  modalStyles.pageIndicator,
                  { backgroundColor: index === currentPage ? '#111827' : '#d1d5db' }
                ]}
              />
            ))}
          </View>
        </View>

        {/* Footer */}
        <View style={modalStyles.footer}>
          <View style={modalStyles.footerButtons}>
            <Button
              variant="outline"
              style={modalStyles.footerButton}
              onPress={() => {}}
              testID="record-actions-button"
              accessibilityLabel="Workout actions"
              accessibilityRole="button"
            >
              <Text style={modalStyles.footerButtonTextSecondary}>Actions</Text>
            </Button>

            <Button
              variant="default"
              style={[modalStyles.footerButton, modalStyles.primaryFooterButton]}
              onPress={() => {}}
              testID="start-recording-button"
              accessibilityLabel="Start recording workout"
              accessibilityRole="button"
            >
              <Text style={modalStyles.footerButtonTextPrimary}>Start Recording</Text>
            </Button>

            <Button
              variant="ghost"
              style={modalStyles.footerButton}
              onPress={() => {}}
              testID="record-settings-button"
              accessibilityLabel="Workout settings"
              accessibilityRole="button"
            >
              <Ionicons name="settings-outline" size={20} color="#6b7280" />
            </Button>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

export default function RecordScreen() {
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <ThemedView style={styles.container} testID="record-screen">
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        testID="record-scroll-view"
      >
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name="add-circle-outline" size={80} color="#111827" />
          </View>

          <Text style={styles.title}>Ready to Record</Text>
          <Text style={styles.subtitle}>
            Track your workout with real-time metrics and GPS tracking
          </Text>

          <View style={styles.featuresContainer}>
            {[
              { icon: 'location-outline', title: 'GPS Tracking', description: 'Accurate route and distance tracking' },
              { icon: 'heart-outline', title: 'Heart Rate', description: 'Monitor your heart rate zones' },
              { icon: 'time-outline', title: 'Real-time Metrics', description: 'Live pace, distance, and duration' },
            ].map((feature, idx) => (
              <Card style={styles.featureCard} key={idx}>
                <Ionicons name={feature.icon as any} size={24} color="#111827" />
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>{feature.description}</Text>
              </Card>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={styles.recordButtonContainer}>
        <TouchableOpacity
          style={styles.recordButton}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.8}
          testID="main-record-button"
          accessibilityLabel="Open workout recording options"
          accessibilityRole="button"
        >
          <Ionicons name="add" size={32} color="white" />
          <Text style={styles.recordButtonText}>Start Workout</Text>
        </TouchableOpacity>
      </View>

      <RecordModal visible={modalVisible} onClose={() => setModalVisible(false)} />
    </ThemedView>
  );
}

// Styles
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 40, paddingBottom: 120 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconContainer: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 12 },
  subtitle: { fontSize: 16, color: '#6b7280', textAlign: 'center', lineHeight: 24, marginBottom: 40, maxWidth: 280 },
  featuresContainer: { gap: 16, width: '100%' },
  featureCard: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: '#fff', borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  featureTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginLeft: 16, marginBottom: 4 },
  featureDescription: { fontSize: 14, color: '#6b7280', marginLeft: 16, flex: 1 },
  recordButtonContainer: { position: 'absolute', bottom: 20, left: 20, right: 20, paddingBottom: 70 },
  recordButton: { backgroundColor: '#111827', height: 60, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  recordButtonText: { fontSize: 18, fontWeight: '600', color: 'white' },
});

// Modal Styles
const modalStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e5e5' },
  closeButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f3f3', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#111827' },
  activityTypeButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#f3f3f3', borderRadius: 12 },
  activityTypeText: { fontSize: 14, fontWeight: '500', color: '#111827' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  metricsContainer: { flexGrow: 0 },
  metricCard: { width: '100%', maxWidth: 280, padding: 40, alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 },
  metricTitle: { fontSize: 14, fontWeight: '500', color: '#6b7280', marginBottom: 8 },
  metricValue: { fontSize: 48, fontWeight: '700', color: '#111827', marginBottom: 8 },
  metricUnit: { fontSize: 16, color: '#9ca3af' },
  pageIndicators: { flexDirection: 'row', gap: 8, marginTop: 40 },
  pageIndicator: { width: 8, height: 8, borderRadius: 4 },
  footer: { backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, borderTopWidth: 1, borderTopColor: '#e5e5e5' },
  footerButtons: { flexDirection: 'row', gap: 12 },
  footerButton: { flex: 1, height: 48, borderRadius: 12 },
  primaryFooterButton: { backgroundColor: '#111827' },
  footerButtonTextPrimary: { fontSize: 16, fontWeight: '600', color: 'white' },
  footerButtonTextSecondary: { fontSize: 16, fontWeight: '600', color: '#111827' },
});
;