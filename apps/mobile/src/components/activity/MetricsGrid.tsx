import React, { useMemo } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import { useEnhancedActivityRecording } from "../../lib/hooks/useEnhancedActivityRecording";
import { MetricCard } from "./MetricCard";

const screenWidth = Dimensions.get("window").width;

// ===== ENHANCED METRICS GRID WITH SERVICE INTEGRATION =====

interface MetricsGridProps {
  // Support both legacy prop-based metrics and service-integrated metrics
  metrics?: {
    id: string;
    title: string;
    value: string;
    unit: string;
    isLive?: boolean;
    dataSource?: string;
    sourceIcon?: string;
  }[];
  columns?: number;
  // New: Use live metrics from service
  useLiveMetrics?: boolean;
}

export const MetricsGrid: React.FC<MetricsGridProps> = ({
  metrics: propMetrics,
  columns = 2,
  useLiveMetrics = true,
}) => {
  const {
    metrics: serviceMetrics,
    connectionStatus,
    isRecording,
  } = useEnhancedActivityRecording();

  // ===== LIVE METRICS TRANSFORMATION =====
  const liveMetrics = useMemo(() => {
    if (!useLiveMetrics || !serviceMetrics) return [];

    const formatDuration = (seconds: number): string => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;

      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
      }
      return `${minutes}:${secs.toString().padStart(2, "0")}`;
    };

    const formatDistance = (meters: number): string => {
      if (meters >= 1000) {
        return (meters / 1000).toFixed(2);
      }
      return meters.toFixed(0);
    };

    const formatSpeed = (mps: number): string => {
      // Convert m/s to km/h for display
      return (mps * 3.6).toFixed(1);
    };

    const formatPace = (mps: number): string => {
      if (mps === 0) return "--:--";
      // Convert m/s to speed (min/km)
      const paceSeconds = 1000 / mps;
      const minutes = Math.floor(paceSeconds / 60);
      const seconds = Math.floor(paceSeconds % 60);
      return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    };

    return [
      {
        id: "duration",
        title: "Duration",
        value: formatDuration(serviceMetrics.duration || 0),
        unit: "",
        isLive: isRecording,
        dataSource: "Timer",
        sourceIcon: "⏱️",
      },
      {
        id: "distance",
        title: "Distance",
        value: formatDistance(serviceMetrics.distance || 0),
        unit: serviceMetrics.distance >= 1000 ? "km" : "m",
        isLive: isRecording && connectionStatus.gps === "connected",
        dataSource: "GPS",
        sourceIcon: connectionStatus.gps === "connected" ? "📍" : "🔍",
      },
      {
        id: "speed",
        title: "Speed",
        value: formatSpeed(serviceMetrics.currentSpeed || 0),
        unit: "km/h",
        isLive: isRecording && connectionStatus.gps === "connected",
        dataSource: "GPS",
        sourceIcon: connectionStatus.gps === "connected" ? "📍" : "🔍",
      },
      {
        id: "speed",
        title: "Pace",
        value: formatPace(serviceMetrics.avgSpeed || 0),
        unit: "min/km",
        isLive: isRecording && connectionStatus.gps === "connected",
        dataSource: "GPS",
        sourceIcon: connectionStatus.gps === "connected" ? "📍" : "🔍",
      },
      {
        id: "heartRate",
        title: "Heart Rate",
        value: serviceMetrics.heartRate?.toString() || "--",
        unit: "bpm",
        isLive:
          isRecording && connectionStatus.sensors.heartRate === "connected",
        dataSource: "Heart Rate Monitor",
        sourceIcon:
          connectionStatus.sensors.heartRate === "connected" ? "💓" : "🔍",
      },
      {
        id: "calories",
        title: "Calories",
        value: serviceMetrics.calories?.toString() || "0",
        unit: "kcal",
        isLive: isRecording,
        dataSource: "Estimated",
        sourceIcon: "🔥",
      },
    ];
  }, [serviceMetrics, connectionStatus, isRecording, useLiveMetrics]);

  // Use live metrics from service if enabled, otherwise use prop metrics
  const displayMetrics = useLiveMetrics ? liveMetrics : propMetrics || [];
  const cardWidth = (screenWidth - 32 - (columns - 1) * 16) / columns;

  return (
    <View style={styles.metricsGrid}>
      {displayMetrics.map((metric) => (
        <EnhancedMetricCard
          key={metric.id}
          metric={metric}
          cardWidth={cardWidth}
        />
      ))}
    </View>
  );
};

// ===== ENHANCED METRIC CARD WITH VISUAL INDICATORS =====
const EnhancedMetricCard: React.FC<{
  metric: {
    id: string;
    title: string;
    value: string;
    unit: string;
    isLive?: boolean;
    dataSource?: string;
    sourceIcon?: string;
  };
  cardWidth: number;
}> = ({ metric, cardWidth }) => {
  return (
    <View style={[styles.enhancedCard, { width: cardWidth }]}>
      {/* Live indicator */}
      {metric.isLive && (
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
        </View>
      )}

      {/* Source icon */}
      {metric.sourceIcon && (
        <View style={styles.sourceIcon}>
          <View style={styles.sourceIconText}>
            <span>{metric.sourceIcon}</span>
          </View>
        </View>
      )}

      {/* Fallback to original MetricCard for styling */}
      <MetricCard metric={metric} cardWidth={cardWidth} />
    </View>
  );
};

const styles = StyleSheet.create({
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  enhancedCard: {
    position: "relative",
    marginBottom: 16,
  },
  liveIndicator: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 10,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10b981", // Green color for live
  },
  sourceIcon: {
    position: "absolute",
    top: 8,
    left: 8,
    zIndex: 10,
  },
  sourceIconText: {
    fontSize: 12,
    opacity: 0.7,
  },
});

// ===== LEGACY EXPORT FOR BACKWARD COMPATIBILITY =====
export default MetricsGrid;
