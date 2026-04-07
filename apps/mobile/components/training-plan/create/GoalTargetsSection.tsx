import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { Flag, Gauge, Heart, Pencil, Trash2, Zap } from "lucide-react-native";
import React from "react";
import { Pressable, View } from "react-native";
import { getActivityCategoryLabel, getTargetTypeLabel } from "./GoalTargetEditorModal";
import type { GoalFormData, GoalTargetFormData, GoalTargetType } from "./SinglePageForm";

interface GoalTargetsSectionProps {
  activeGoal: GoalFormData;
  getTargetRowError: (targetIndex: number) => string | undefined;
  onAddTargetWithType: (targetType: GoalTargetType) => void;
  onEditTarget: (targetId: string) => void;
  onRemoveTarget: (targetId: string) => void;
}

const getTargetSummary = (target: GoalTargetFormData) => {
  if (target.targetType === "race_performance") {
    const parts = [];
    const categoryLabel = target.activityCategory
      ? getActivityCategoryLabel(target.activityCategory)
      : undefined;
    if (categoryLabel) {
      parts.push(categoryLabel);
    }
    if (target.distanceKm?.trim()) {
      parts.push(`${target.distanceKm.trim()} km`);
    }
    if (target.completionTimeHms?.trim()) {
      parts.push(target.completionTimeHms.trim());
    }
    return parts.length > 0 ? parts.join(" - ") : "Distance + completion time";
  }

  if (target.targetType === "pace_threshold") {
    const parts = [];
    const categoryLabel = target.activityCategory
      ? getActivityCategoryLabel(target.activityCategory)
      : undefined;
    if (categoryLabel) {
      parts.push(categoryLabel);
    }
    if (target.paceMmSs?.trim()) {
      parts.push(`${target.paceMmSs.trim()} /km`);
    }
    if (target.testDurationHms?.trim()) {
      parts.push(`test ${target.testDurationHms.trim()}`);
    }
    return parts.length > 0 ? parts.join(" - ") : "Pace + test duration";
  }

  if (target.targetType === "power_threshold") {
    const parts = [];
    const categoryLabel = target.activityCategory
      ? getActivityCategoryLabel(target.activityCategory)
      : undefined;
    if (categoryLabel) {
      parts.push(categoryLabel);
    }
    if (target.targetWatts !== undefined) {
      parts.push(`${target.targetWatts} W`);
    }
    if (target.testDurationHms?.trim()) {
      parts.push(`test ${target.testDurationHms.trim()}`);
    }
    return parts.length > 0 ? parts.join(" - ") : "Watts + test duration";
  }

  if (target.targetLthrBpm !== undefined) {
    return `${target.targetLthrBpm} bpm`;
  }
  return "LTHR bpm";
};

const renderTargetIcon = (targetType: GoalTargetType) => {
  if (targetType === "race_performance") {
    return <Flag size={13} className="text-muted-foreground" />;
  }

  if (targetType === "pace_threshold") {
    return <Gauge size={13} className="text-muted-foreground" />;
  }

  if (targetType === "power_threshold") {
    return <Zap size={13} className="text-muted-foreground" />;
  }

  return <Heart size={13} className="text-muted-foreground" />;
};

export function GoalTargetsSection({
  activeGoal,
  getTargetRowError,
  onAddTargetWithType,
  onEditTarget,
  onRemoveTarget,
}: GoalTargetsSectionProps) {
  return (
    <View className="gap-2 rounded-md border border-border bg-background/70 p-2">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-muted-foreground">Targets</Text>
        <View className="flex-row gap-1.5">
          <Button
            variant="outline"
            size="icon"
            onPress={() => onAddTargetWithType("race_performance")}
            accessibilityLabel="Add race target"
          >
            <Flag size={14} className="text-muted-foreground" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onPress={() => onAddTargetWithType("pace_threshold")}
            accessibilityLabel="Add pace target"
          >
            <Gauge size={14} className="text-muted-foreground" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onPress={() => onAddTargetWithType("power_threshold")}
            accessibilityLabel="Add power target"
          >
            <Zap size={14} className="text-muted-foreground" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onPress={() => onAddTargetWithType("hr_threshold")}
            accessibilityLabel="Add heart-rate target"
          >
            <Heart size={14} className="text-muted-foreground" />
          </Button>
        </View>
      </View>

      {activeGoal.targets.map((target, targetIndex) => {
        const rowError = getTargetRowError(targetIndex);

        return (
          <View
            key={target.id}
            className={`gap-1 rounded-md border bg-background/80 px-2 py-2 ${rowError ? "border-destructive bg-destructive/5" : "border-border"}`}
          >
            <View className="flex-row items-center gap-2">
              {renderTargetIcon(target.targetType)}
              <Pressable onPress={() => onEditTarget(target.id)} className="flex-1 gap-0.5">
                <Text className="text-xs font-medium">{getTargetTypeLabel(target.targetType)}</Text>
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                  {getTargetSummary(target)}
                </Text>
              </Pressable>
              <Button
                variant="outline"
                size="icon"
                onPress={() => onEditTarget(target.id)}
                accessibilityLabel="Edit target"
              >
                <Pencil size={14} className="text-muted-foreground" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onPress={() => onRemoveTarget(target.id)}
                disabled={activeGoal.targets.length <= 1}
                accessibilityLabel="Delete target"
              >
                <Trash2 size={14} className="text-muted-foreground" />
              </Button>
              {rowError ? (
                <Text className="text-[11px] font-medium text-destructive">Adjust</Text>
              ) : null}
            </View>

            {rowError ? <Text className="text-xs text-destructive">{rowError}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}
