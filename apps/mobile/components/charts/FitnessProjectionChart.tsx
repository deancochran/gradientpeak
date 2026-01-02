import { Text } from "@/components/ui/text";
import { View } from "react-native";
import { PlanVsActualChart } from "./PlanVsActualChart";
import { calculateCTLProjection } from "@repo/core";
import type { TrainingBlock, FitnessProgression } from "@repo/core";
import React, { useMemo } from "react";

// Legacy Mesocycle type for backwards compatibility
type Mesocycle = any;

// Legacy props (for backwards compatibility)
export interface LegacyFitnessProjectionChartProps {
  currentCTL: number;
  targetCTL: number;
  targetDate: string;
  weeklyTSSAvg: number;
  mesocycles?: Mesocycle[];
  rampRate?: number;
  recoveryWeekFrequency?: number;
  recoveryWeekReduction?: number;
  height?: number;
}

// New v2 props (for blocks-based plans)
export interface BlocksFitnessProjectionChartProps {
  blocks: TrainingBlock[];
  fitnessProgression?: FitnessProgression;
  height?: number;
}

export type FitnessProjectionChartProps =
  | LegacyFitnessProjectionChartProps
  | BlocksFitnessProjectionChartProps;

function isBlocksProps(
  props: FitnessProjectionChartProps,
): props is BlocksFitnessProjectionChartProps {
  return "blocks" in props;
}

export function FitnessProjectionChart(props: FitnessProjectionChartProps) {
  const height = props.height || 300;

  // Calculate projected CTL progression
  const projectionData = useMemo(() => {
    if (isBlocksProps(props)) {
      // New v2 schema with blocks
      const { blocks, fitnessProgression } = props;

      if (blocks.length === 0 || !fitnessProgression) {
        return [];
      }

      // Generate CTL projection from blocks
      const startDate = new Date(blocks[0]!.start_date);
      const endDate = new Date(blocks[blocks.length - 1]!.end_date);
      const totalDays = Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000),
      );

      let currentCTL = fitnessProgression.starting_ctl;
      const projection: Array<{ date: string; ctl: number }> = [];

      // Add starting point
      projection.push({
        date: startDate.toISOString().split("T")[0] || "",
        ctl: currentCTL,
      });

      // Calculate CTL for each week
      for (let day = 7; day <= totalDays; day += 7) {
        const currentDate = new Date(startDate);
        currentDate.setDate(currentDate.getDate() + day);
        const dateStr = currentDate.toISOString().split("T")[0] || "";

        // Find which block this date falls in
        const block = blocks.find(
          (b) => dateStr >= b.start_date && dateStr <= b.end_date,
        );

        if (block) {
          // Calculate weekly TSS target
          const weeklyTSS = block.target_weekly_tss_range?.max || 0;

          // Apply taper reduction if in taper phase
          const taperFactor = block.phase === "taper" ? 0.6 : 1.0;

          const effectiveTSS = weeklyTSS * taperFactor;

          // Update CTL (exponentially weighted with 42-day time constant)
          const dailyTSS = effectiveTSS / 7;
          currentCTL =
            currentCTL + (dailyTSS - currentCTL) * (1 - Math.exp(-1 / 42));
        }

        projection.push({ date: dateStr, ctl: Math.round(currentCTL) });
      }

      return projection;
    } else {
      // Legacy v1 schema with mesocycles
      const {
        currentCTL,
        targetCTL,
        weeklyTSSAvg,
        mesocycles = [],
        recoveryWeekFrequency = 3,
        recoveryWeekReduction = 0.5,
      } = props;

      if (mesocycles.length === 0) {
        return [];
      }

      const projection = calculateCTLProjection({
        startingCTL: currentCTL,
        targetCTL,
        weeklyTSSAvg,
        mesocycles,
        recoveryWeekFrequency,
        recoveryWeekReduction,
      });

      return projection.map((point) => ({
        date: point.date,
        ctl: point.ctl,
      }));
    }
  }, [props]);

  // Empty state if no valid data
  if (projectionData.length === 0) {
    return (
      <View
        className="bg-card rounded-lg border border-border p-4 items-center justify-center"
        style={{ height }}
      >
        <Text className="text-muted-foreground text-sm text-center">
          Configure training phases to see fitness projection
        </Text>
      </View>
    );
  }

  // Extract goal metrics
  const goalMetrics = isBlocksProps(props)
    ? {
        targetCTL: props.fitnessProgression?.target_ctl_at_peak || 0,
        targetDate: props.blocks[props.blocks.length - 1]?.end_date || "",
        description: `Peak fitness projection`,
      }
    : {
        targetCTL: props.targetCTL,
        targetDate: props.targetDate,
        description: `${props.targetCTL} CTL by ${new Date(props.targetDate).toLocaleDateString()}`,
      };

  // Render chart with projection
  return (
    <PlanVsActualChart
      actualData={[]} // No historical data during plan creation
      projectedData={projectionData}
      goalMetrics={goalMetrics}
      height={height}
      showLegend={true}
    />
  );
}
