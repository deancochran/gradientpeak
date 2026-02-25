import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import type { BlockingIssue } from "@/lib/training-plan-form/validation";
import type {
  CreationContextSummary,
  CreationFeasibilitySafetySummary,
} from "@repo/core";
import { ShieldAlert } from "lucide-react-native";
import React from "react";
import { View } from "react-native";

interface ReviewTabProps {
  contextSummary?: CreationContextSummary;
  isPreviewPending: boolean;
  showContextDetails: boolean;
  setShowContextDetails: React.Dispatch<React.SetStateAction<boolean>>;
  noHistoryMetadata?: {
    projection_floor_confidence?: string | null;
    projection_floor_applied?: boolean;
    floor_clamped_by_availability?: boolean;
    fitness_inference_reasons?: string[];
  };
  noHistoryConfidenceLabel: string;
  noHistoryFloorAppliedLabel: string;
  noHistoryAvailabilityClampLabel: string;
  noHistoryAccessibilitySummary?: string;
  noHistoryReasons: string[];
  feasibilitySafetySummary?: CreationFeasibilitySafetySummary;
  blockingIssues: BlockingIssue[];
}

export function ReviewTab({
  contextSummary,
  isPreviewPending,
  showContextDetails,
  setShowContextDetails,
  noHistoryMetadata,
  noHistoryConfidenceLabel,
  noHistoryFloorAppliedLabel,
  noHistoryAvailabilityClampLabel,
  noHistoryAccessibilitySummary,
  noHistoryReasons,
  feasibilitySafetySummary,
  blockingIssues,
}: ReviewTabProps) {
  return (
    <>
      <View className="gap-2 rounded-lg border border-border bg-card p-2.5">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="font-semibold">Suggested setup context</Text>
            <Text className="text-xs text-muted-foreground">
              {contextSummary
                ? `Based on ${contextSummary.history_availability_state} history and signal quality ${(contextSummary.signal_quality * 100).toFixed(0)}%`
                : isPreviewPending
                  ? "Loading profile-aware defaults..."
                  : "Using conservative defaults until profile-aware suggestions are available."}
            </Text>
          </View>
          <Button
            variant="outline"
            size="sm"
            onPress={() => setShowContextDetails((prev) => !prev)}
          >
            <Text>{showContextDetails ? "Hide" : "Why"}</Text>
          </Button>
        </View>
        {showContextDetails && contextSummary && (
          <View className="gap-1 rounded-md bg-muted/40 p-2">
            <Text className="text-xs text-muted-foreground">
              Consistency: {contextSummary.recent_consistency_marker}
            </Text>
            <Text className="text-xs text-muted-foreground">
              Effort confidence: {contextSummary.effort_confidence_marker}
            </Text>
            <Text className="text-xs text-muted-foreground">
              Completeness: {contextSummary.profile_metric_completeness_marker}
            </Text>
          </View>
        )}
      </View>

      {noHistoryMetadata ? (
        <View
          className="gap-1.5 rounded-lg border border-border bg-muted/20 p-2.5"
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
          accessibilityLabel={noHistoryAccessibilitySummary}
        >
          <Text className="text-xs font-medium">No-history cues</Text>
          <Text className="text-xs text-muted-foreground">
            Confidence: {noHistoryConfidenceLabel}
          </Text>
          <Text className="text-xs text-muted-foreground">
            Floor applied: {noHistoryFloorAppliedLabel}
          </Text>
          <Text className="text-xs text-muted-foreground">
            Availability clamp: {noHistoryAvailabilityClampLabel}
          </Text>
          {noHistoryReasons.slice(0, 2).map((reason) => (
            <Text key={reason} className="text-xs text-muted-foreground">
              - {reason}
            </Text>
          ))}
        </View>
      ) : null}

      <View className="gap-2 rounded-lg border border-border bg-card p-2.5">
        <View className="flex-row items-center justify-between">
          <Text className="font-semibold">Feasibility and safety</Text>
          {isPreviewPending && (
            <Text className="text-xs text-muted-foreground">Refreshing...</Text>
          )}
        </View>
        {feasibilitySafetySummary ? (
          <>
            <View className="flex-row gap-2">
              <Badge
                variant={
                  feasibilitySafetySummary.feasibility_band === "on-track"
                    ? "default"
                    : "secondary"
                }
              >
                <Text>{feasibilitySafetySummary.feasibility_band}</Text>
              </Badge>
              <Badge
                variant={
                  feasibilitySafetySummary.safety_band === "safe"
                    ? "default"
                    : feasibilitySafetySummary.safety_band === "caution"
                      ? "secondary"
                      : "destructive"
                }
              >
                <Text>{feasibilitySafetySummary.safety_band}</Text>
              </Badge>
            </View>
            {feasibilitySafetySummary.top_drivers.slice(0, 3).map((driver) => (
              <Text key={driver.code} className="text-xs text-muted-foreground">
                - {driver.message}
              </Text>
            ))}
          </>
        ) : (
          <Text className="text-xs text-muted-foreground">
            Complete required goal fields to compute pre-submit safety.
          </Text>
        )}
      </View>

      {blockingIssues.length > 0 && (
        <View className="gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5">
          <View className="flex-row items-center gap-2">
            <ShieldAlert size={16} className="text-destructive" />
            <Text className="font-semibold text-destructive">
              Observations based on known standards
            </Text>
          </View>
          {blockingIssues.map((conflict) => (
            <View
              key={`${conflict.code}-${conflict.message}`}
              className="gap-1 rounded-md border border-destructive/30 p-2"
            >
              <Text className="text-sm text-destructive">
                {conflict.message}
              </Text>
            </View>
          ))}
        </View>
      )}
    </>
  );
}
