import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

interface ActivitySummary {
  id: string;
  name: string;
  duration: string;
  distance: string;
  averageSpeed: string;
  maxSpeed: string;
  calories: number;
  averageHeartRate?: number;
  maxHeartRate?: number;
  averagePower?: number;
  maxPower?: number;
  elevation?: {
    gain: number;
    loss: number;
  };
  tss?: number;
  if?: number;
  np?: number;
}

interface ActivitySummaryModalProps {
  visible: boolean;
  summary: ActivitySummary | null;
  onClose: () => void;
  onViewActivities?: () => void;
  onShare?: () => void;
}

export const ActivitySummaryModal: React.FC<ActivitySummaryModalProps> = ({
  visible,
  summary,
  onClose,
  onViewActivities,
  onShare,
}) => {
  if (!summary) return null;

  const formatMetric = (value: number | undefined, unit: string): string => {
    return value !== undefined ? `${Math.round(value)}${unit}` : "--";
  };

  const getPerformanceColor = (value?: number): string => {
    if (!value) return "#6b7280";

    // For heart rate zones - assuming max HR around 185-200
    if (value > 160) return "#dc2626"; // Red - Zone 5
    if (value > 140) return "#ea580c"; // Orange - Zone 4
    if (value > 120) return "#d97706"; // Amber - Zone 3
    if (value > 100) return "#16a34a"; // Green - Zone 2
    return "#059669"; // Emerald - Zone 1
  };

  const mainMetrics = [
    {
      icon: "time-outline",
      label: "Duration",
      value: summary.duration,
      color: "#3b82f6",
    },
    {
      icon: "navigate-outline",
      label: "Distance",
      value: summary.distance,
      color: "#10b981",
    },
    {
      icon: "speedometer-outline",
      label: "Avg Speed",
      value: summary.averageSpeed,
      color: "#f59e0b",
    },
    {
      icon: "flame-outline",
      label: "Calories",
      value: `${summary.calories} kcal`,
      color: "#ef4444",
    },
  ];

  const detailMetrics = [
    ...(summary.maxSpeed ? [{
      label: "Max Speed",
      value: summary.maxSpeed,
    }] : []),
    ...(summary.averageHeartRate ? [{
      label: "Avg Heart Rate",
      value: formatMetric(summary.averageHeartRate, " bpm"),
      color: getPerformanceColor(summary.averageHeartRate),
    }] : []),
    ...(summary.maxHeartRate ? [{
      label: "Max Heart Rate",
      value: formatMetric(summary.maxHeartRate, " bpm"),
      color: getPerformanceColor(summary.maxHeartRate),
    }] : []),
    ...(summary.averagePower ? [{
      label: "Avg Power",
      value: formatMetric(summary.averagePower, "W"),
    }] : []),
    ...(summary.maxPower ? [{
      label: "Max Power",
      value: formatMetric(summary.maxPower, "W"),
    }] : []),
    ...(summary.elevation ? [{
      label: "Elevation Gain",
      value: formatMetric(summary.elevation.gain, "m"),
    }] : []),
  ];

  const performanceMetrics = [
    ...(summary.tss ? [{
      label: "Training Stress Score",
      value: Math.round(summary.tss),
      description: "Impact of this workout",
    }] : []),
    ...(summary.np ? [{
      label: "Normalized Power",
      value: Math.round(summary.np),
      description: "Adjusted for variations",
    }] : []),
    ...(summary.if ? [{
      label: "Intensity Factor",
      value: summary.if.toFixed(2),
      description: "Relative to FTP",
    }] : []),
  ];

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
          <View style={styles.headerLeft}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark" size={24} color="#ffffff" />
            </View>
            <View>
              <Text style={styles.headerTitle}>Activity Saved!</Text>
              <Text style={styles.headerSubtitle}>{summary.name}</Text>
            </View>
          </View>

          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#6b7280" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Main Metrics Grid */}
          <View style={styles.section}>
            <View style={styles.metricsGrid}>
              {mainMetrics.map((metric, index) => (
                <View key={index} style={styles.mainMetricCard}>
                  <View style={[styles.metricIcon, { backgroundColor: metric.color + "20" }]}>
                    <Ionicons
                      name={metric.icon as keyof typeof Ionicons.glyphMap}
                      size={20}
                      color={metric.color}
                    />
                  </View>
                  <Text style={styles.metricValue}>{metric.value}</Text>
                  <Text style={styles.metricLabel}>{metric.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Detail Metrics */}
          {detailMetrics.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Performance Details</Text>
              <View style={styles.detailMetricsContainer}>
                {detailMetrics.map((metric, index) => (
                  <View key={index} style={styles.detailMetricRow}>
                    <Text style={styles.detailMetricLabel}>{metric.label}</Text>
                    <Text
                      style={[
                        styles.detailMetricValue,
                        metric.color && { color: metric.color }
                      ]}
                    >
                      {metric.value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Performance Metrics */}
          {performanceMetrics.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Training Analysis</Text>
              <View style={styles.performanceContainer}>
                {performanceMetrics.map((metric, index) => (
                  <View key={index} style={styles.performanceCard}>
                    <Text style={styles.performanceValue}>{metric.value}</Text>
                    <Text style={styles.performanceLabel}>{metric.label}</Text>
                    <Text style={styles.performanceDescription}>{metric.description}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Sync Status */}
          <View style={styles.section}>
            <View style={styles.syncStatus}>
              <Ionicons name="cloud-upload-outline" size={16} color="#10b981" />
              <Text style={styles.syncText}>
                Saved locally and will sync to cloud when connected
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          {onViewActivities && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={onViewActivities}
            >
              <Ionicons name="list-outline" size={20} color="#ffffff" />
              <Text style={styles.primaryButtonText}>View All Activities</Text>
            </TouchableOpacity>
          )}

          <View style={styles.secondaryActions}>
            {onShare && (
              <TouchableOpacity style={styles.secondaryButton} onPress={onShare}>
                <Ionicons name="share-outline" size={18} color="#6b7280" />
                <Text style={styles.secondaryButtonText}>Share</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
              <Ionicons name="checkmark-outline" size={18} color="#6b7280" />
              <Text style={styles.secondaryButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  successIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 2,
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 120, // Space for action buttons
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  mainMetricCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  metricIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: "#6b7280",
    textAlign: "center",
  },
  detailMetricsContainer: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 16,
  },
  detailMetricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  detailMetricLabel: {
    fontSize: 14,
    color: "#6b7280",
  },
  detailMetricValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  performanceContainer: {
    gap: 12,
  },
  performanceCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  performanceValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#3b82f6",
    marginBottom: 4,
  },
  performanceLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  performanceDescription: {
    fontSize: 12,
    color: "#6b7280",
    textAlign: "center",
  },
  syncStatus: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  syncText: {
    fontSize: 12,
    color: "#166534",
    flex: 1,
  },
  actionContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3b82f6",
    borderRadius: 8,
    paddingVertical: 14,
    marginBottom: 12,
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  secondaryActions: {
    flexDirection: "row",
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    paddingVertical: 12,
    gap: 6,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
  },
});
