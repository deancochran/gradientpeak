import React from "react";
import { Dimensions, StyleSheet, View } from "react-native";

import { MetricCard } from "./MetricCard";

const screenWidth = Dimensions.get("window").width;

interface MetricsGridProps {
  metrics: {
    id: string;
    title: string;
    value: string;
    unit: string;
  }[];
  columns?: number;
}

export const MetricsGrid: React.FC<MetricsGridProps> = ({
  metrics,
  columns = 2,
}) => {
  const cardWidth = (screenWidth - 32 - (columns - 1) * 16) / columns;

  return (
    <View style={styles.metricsGrid}>
      {metrics.map((metric) => (
        <MetricCard key={metric.id} metric={metric} cardWidth={cardWidth} />
      ))}
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
});
