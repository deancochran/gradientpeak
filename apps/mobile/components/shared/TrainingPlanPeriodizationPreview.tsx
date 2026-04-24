import React, { Fragment } from "react";
import { View } from "react-native";
import type { TrainingPlanVisualModel, TrainingPlanVisualPhase } from "@/lib/trainingPlanVisual";

type TrainingPlanPeriodizationPreviewProps = {
  compact?: boolean;
  model: TrainingPlanVisualModel;
  testID?: string;
};

const phaseToneClass: Record<TrainingPlanVisualPhase, string> = {
  foundation: "bg-sky-500/25",
  build: "bg-blue-500/25",
  specific: "bg-violet-500/25",
  peak: "bg-amber-500/30",
  recover: "bg-emerald-500/25",
  maintain: "bg-slate-500/25",
};

const sportAccentClasses: Record<string, string> = {
  bike: "bg-blue-500",
  cycling: "bg-blue-500",
  mixed: "bg-zinc-400",
  other: "bg-zinc-400",
  run: "bg-orange-500",
  running: "bg-orange-500",
  strength: "bg-emerald-500",
  swim: "bg-cyan-500",
  swimming: "bg-cyan-500",
  triathlon: "bg-fuchsia-500",
};

function getSportAccentClass(sport: string) {
  return sportAccentClasses[sport] ?? "bg-primary";
}

export function TrainingPlanPeriodizationPreview({
  compact = false,
  model,
  testID,
}: TrainingPlanPeriodizationPreviewProps) {
  return (
    <View
      className="overflow-hidden rounded-2xl border border-border bg-card"
      testID={testID ?? "training-plan-periodization-preview"}
    >
      <View className={`${compact ? "px-3 pb-3 pt-3" : "px-3 pb-3 pt-4"}`}>
        <View className={`flex-row items-end gap-1 ${compact ? "h-28" : "h-32"}`}>
          {model.segments.map((segment) => {
            const sportMixEntries = Object.entries(segment.sportMix)
              .filter(([, value]) => value > 0)
              .sort((left, right) => right[1] - left[1]);
            const totalSegmentCount = model.segments.length;
            const minHeightPercent = compact ? 18 : 16;
            const barHeight = minHeightPercent + segment.relativeLoad * (compact ? 72 : 76);
            const specificityOpacity = 0.34 + segment.relativeSpecificity * 0.34;
            const recoveryOffset =
              segment.relativeRecovery > 0.6 ? 10 : segment.relativeRecovery > 0.3 ? 5 : 0;
            const isRecoveryWeek = segment.relativeRecovery >= 0.6;
            const isModerateRecoveryWeek = !isRecoveryWeek && segment.relativeRecovery >= 0.35;
            const isPeakWeek =
              segment.phase === "peak" || (segment.isGoalSegment && !isRecoveryWeek);
            const barOpacity = isRecoveryWeek
              ? Math.max(0.26, specificityOpacity - 0.24)
              : isModerateRecoveryWeek
                ? Math.max(0.34, specificityOpacity - 0.12)
                : isPeakWeek
                  ? Math.min(0.96, specificityOpacity + 0.16)
                  : specificityOpacity;
            const topCapHeight = isRecoveryWeek
              ? compact
                ? 4
                : 5
              : isModerateRecoveryWeek
                ? 3
                : 0;
            const recoveryCapClass = isRecoveryWeek
              ? "bg-background/95"
              : isModerateRecoveryWeek
                ? "bg-background/80"
                : "bg-transparent";
            const barBorderClass = isRecoveryWeek
              ? "border-border/35"
              : isModerateRecoveryWeek
                ? "border-border/45"
                : isPeakWeek
                  ? "border-amber-400/70"
                  : "border-border/60";
            const peakCapHeight = isPeakWeek ? (compact ? 3 : 4) : 0;
            const widthClass =
              totalSegmentCount >= 14 ? "w-[92%]" : totalSegmentCount >= 10 ? "w-[94%]" : "w-full";
            const accentHeightClass = compact ? "h-1" : "h-1.5";

            return (
              <View
                key={`training-plan-segment-${segment.index}`}
                className="flex-1 items-center justify-end"
                testID={`training-plan-visual-segment-${segment.index}`}
              >
                {segment.isGoalSegment ? (
                  <View className="mb-1 h-2 w-2 rounded-full bg-primary" />
                ) : (
                  <View className="mb-3 h-0.5 w-0.5 opacity-0" />
                )}
                <View className="w-full items-center justify-end">
                  <View
                    className={`${widthClass} overflow-hidden rounded-t-xl border-x border-t ${barBorderClass} ${phaseToneClass[segment.phase]}`}
                    style={{
                      height: `${Math.max(minHeightPercent, barHeight - recoveryOffset)}%`,
                      opacity: barOpacity,
                    }}
                  >
                    {peakCapHeight > 0 ? (
                      <View
                        className="w-full bg-amber-300/70"
                        style={{ height: peakCapHeight }}
                        testID={`training-plan-visual-peak-${segment.index}`}
                      />
                    ) : null}
                    {topCapHeight > 0 ? (
                      <View
                        className={`w-full ${recoveryCapClass}`}
                        style={{ height: topCapHeight }}
                      />
                    ) : null}
                    {isRecoveryWeek ? (
                      <View
                        className="flex-1 justify-end px-1 pb-1"
                        testID={`training-plan-visual-recovery-${segment.index}`}
                      >
                        <View className="h-0.5 rounded-full bg-background/90" />
                        <View className="mt-1 h-0.5 rounded-full bg-background/80" />
                      </View>
                    ) : isModerateRecoveryWeek ? (
                      <View
                        className="flex-1 justify-end px-1 pb-1"
                        testID={`training-plan-visual-recovery-${segment.index}`}
                      >
                        <View className="h-0.5 rounded-full bg-background/70" />
                      </View>
                    ) : null}
                  </View>
                  <View
                    className={`mt-1 ${accentHeightClass} ${widthClass} flex-row overflow-hidden rounded-full bg-muted/35`}
                  >
                    {sportMixEntries.length > 0 ? (
                      sportMixEntries.map(([sport, value]) => (
                        <Fragment key={`${segment.index}-${sport}`}>
                          <View
                            className={getSportAccentClass(sport)}
                            style={{ flex: Math.max(value, 0.08), opacity: 0.78 }}
                          />
                        </Fragment>
                      ))
                    ) : (
                      <View className="flex-1 bg-primary" style={{ opacity: 0.78 }} />
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
