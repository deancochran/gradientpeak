import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { BoundedNumberInput } from "../inputs/BoundedNumberInput";
import { parseNumberOrUndefined } from "@/lib/training-plan-form/input-parsers";
import type { CreationRecentInfluenceAction } from "@repo/core";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import React from "react";
import { Pressable, View } from "react-native";
import type { TrainingPlanConfigFormData } from "../SinglePageForm";

interface InfluenceTabProps {
  configData: TrainingPlanConfigFormData;
  expanded: boolean;
  showDetails: boolean;
  signedInfluenceScore: string;
  influenceEducationBullets: string[];
  goalInfluenceWeights: Array<{
    id: string;
    label: string;
    priority: number;
    percent: number;
  }>;
  recentInfluenceActionOptionCopy: Record<
    CreationRecentInfluenceAction,
    { label: string; helper: string }
  >;
  onToggleExpanded: () => void;
  onToggleDetails: () => void;
  updateConfig: (updater: (draft: TrainingPlanConfigFormData) => void) => void;
}

export function InfluenceTab({
  configData,
  expanded,
  showDetails,
  signedInfluenceScore,
  influenceEducationBullets,
  goalInfluenceWeights,
  recentInfluenceActionOptionCopy,
  onToggleExpanded,
  onToggleDetails,
  updateConfig,
}: InfluenceTabProps) {
  const influenceActionCopy =
    recentInfluenceActionOptionCopy[configData.recentInfluenceAction];

  return (
    <View className="gap-2 rounded-lg border border-border bg-card p-2.5">
      <Pressable
        onPress={onToggleExpanded}
        className="flex-row items-center justify-between rounded-md border border-border px-3 py-2"
      >
        <View className="flex-1">
          <Text className="text-sm font-medium">Recent training effect</Text>
          <Text className="text-xs text-muted-foreground">
            {influenceActionCopy.label}
            {configData.recentInfluenceAction === "disabled"
              ? " - off"
              : ` - ${signedInfluenceScore}`}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Text className="text-xs text-muted-foreground">
            {expanded ? "Hide" : "Edit"}
          </Text>
          {expanded ? (
            <ChevronUp size={16} className="text-muted-foreground" />
          ) : (
            <ChevronDown size={16} className="text-muted-foreground" />
          )}
        </View>
      </Pressable>

      {expanded && (
        <View className="gap-2 rounded-md border border-border bg-muted/20 p-2.5">
          <View className="items-end">
            <Button variant="outline" size="sm" onPress={onToggleDetails}>
              <Text>{showDetails ? "Hide details" : "Learn"}</Text>
            </Button>
          </View>

          {showDetails && (
            <>
              <View className="gap-1 rounded-md border border-border bg-background/80 p-2">
                {influenceEducationBullets.map((bullet) => (
                  <Text key={bullet} className="text-xs text-muted-foreground">
                    - {bullet}
                  </Text>
                ))}
              </View>

              <View className="gap-1 rounded-md border border-border bg-background/80 p-2">
                <Text className="text-sm font-medium">Goal weighting</Text>
                {goalInfluenceWeights.map((goal) => (
                  <View
                    key={goal.id}
                    className="flex-row items-center justify-between rounded-md border border-border px-2 py-1.5"
                  >
                    <View className="flex-1 pr-2">
                      <Text className="text-sm font-medium" numberOfLines={1}>
                        {goal.label}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        Priority {goal.priority}
                      </Text>
                    </View>
                    <Text className="text-xs text-muted-foreground">
                      {goal.percent.toFixed(0)}%
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <View className="flex-row gap-2">
            {(["accepted", "edited", "disabled"] as const).map((action) => (
              <Button
                key={action}
                variant={
                  configData.recentInfluenceAction === action
                    ? "default"
                    : "outline"
                }
                size="sm"
                accessibilityLabel={`Recent influence mode: ${recentInfluenceActionOptionCopy[action].label}`}
                accessibilityHint={
                  recentInfluenceActionOptionCopy[action].helper
                }
                onPress={() => {
                  updateConfig((draft) => {
                    draft.recentInfluenceAction = action;
                    if (action === "disabled") {
                      draft.recentInfluenceScore = 0;
                      draft.recentInfluenceProvenance = {
                        ...draft.recentInfluenceProvenance,
                        source: "user",
                        updated_at: new Date().toISOString(),
                      };
                    }
                    if (action === "accepted") {
                      draft.recentInfluenceProvenance = {
                        ...draft.recentInfluenceProvenance,
                        source: "suggested",
                        updated_at: new Date().toISOString(),
                      };
                    }
                  });
                }}
              >
                <Text>{recentInfluenceActionOptionCopy[action].label}</Text>
              </Button>
            ))}
          </View>

          <BoundedNumberInput
            id="recent-influence-score"
            label="Effect score"
            value={String(configData.recentInfluenceScore)}
            min={-1}
            max={1}
            decimals={3}
            helperText="-1.00 to 1.00"
            accessibilityHint="Enter a value from minus one point zero zero to plus one point zero zero"
            onChange={(value) => {
              const parsed = parseNumberOrUndefined(value);
              if (parsed === undefined) {
                return;
              }
              updateConfig((draft) => {
                draft.recentInfluenceScore = Math.max(
                  -1,
                  Math.min(1, Number(parsed.toFixed(3))),
                );
                draft.recentInfluenceAction = "edited";
                draft.recentInfluenceProvenance = {
                  ...draft.recentInfluenceProvenance,
                  source: "user",
                  updated_at: new Date().toISOString(),
                };
              });
            }}
          />
        </View>
      )}
    </View>
  );
}
