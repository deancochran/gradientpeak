import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { WorkoutMetric } from "@/lib/types/workout";
import { Card } from "../ui/card";

interface MetricCardProps {
  metric: WorkoutMetric;
  cardWidth?: number;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  metric,
  cardWidth
}) => (
  <Card style={[styles.metricCard, cardWidth && { width: cardWidth }]}>
    <View style={styles.metricHeader}>
      <View style={styles.metricTitleContainer}>
        <Ionicons
          name={metric.icon}
          size={16}
          color={metric.isLive ? "#dc2626" : "#6b7280"}
        />
        <Text
          style={[styles.metricTitle, metric.isLive && styles.liveMetricTitle]}
        >
          {metric.title}
        </Text>
      </View>
      {metric.isLive && (
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      )}
    </View>
    <Text style={[styles.metricValue, metric.isLive && styles.liveMetricValue]}>
      {metric.value}
    </Text>
    <Text style={[styles.metricUnit, metric.isLive && styles.liveMetricUnit]}>
      {metric.unit}
    </Text>
  </Card>
);

const styles = StyleSheet.create({
  metricCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  metricHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  metricTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  metricTitle: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7280",
    marginLeft: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  liveMetricTitle: {
    color: "#dc2626",
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
  },
  liveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#dc2626",
    marginRight: 4,
  },
  liveText: {
    fontSize: 8,
    fontWeight: "600",
    color: "#dc2626",
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  liveMetricValue: {
    color: "#dc2626",
  },
  metricUnit: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
  },
  liveMetricUnit: {
    color: "#dc2626",
  },
});
