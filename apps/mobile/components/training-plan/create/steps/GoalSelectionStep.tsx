import { createEmptyGoalDraft, type WizardGoalInput } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { GoalEditorModal } from "@/components/goals";
import { WizardStep } from "../WizardStep";

interface GoalSelectionStepProps {
  goal: WizardGoalInput;
  onGoalChange: (goal: WizardGoalInput) => void;
  onNext: () => void;
  onBack?: () => void;
  currentStep: number;
  totalSteps: number;
}

export function GoalSelectionStep({
  goal,
  onGoalChange,
  onNext,
  onBack,
  currentStep,
  totalSteps,
}: GoalSelectionStepProps) {
  const [showGoalEditor, setShowGoalEditor] = useState(false);

  const weeksUntil = useMemo(() => {
    if (!goal.target_date) {
      return 0;
    }

    return Math.ceil(
      (new Date(goal.target_date).getTime() - new Date().getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
  }, [goal.target_date]);

  const isValid = goal.name.trim().length > 0 && goal.target_date.length > 0;

  return (
    <>
      <WizardStep
        currentStep={currentStep}
        totalSteps={totalSteps}
        title="What's your goal?"
        description="Set your main event with the reusable goal editor"
        onBack={onBack}
        onNext={onNext}
        nextDisabled={!isValid}
      >
        <Card>
          <CardContent className="p-4 gap-3">
            <View className="gap-1">
              <Text className="text-xs text-muted-foreground uppercase">Goal</Text>
              <Text className="text-base font-semibold text-foreground">
                {goal.name || "No goal selected"}
              </Text>
            </View>
            <View className="gap-1">
              <Text className="text-xs text-muted-foreground uppercase">Target date</Text>
              <Text className="text-sm text-foreground">
                {goal.target_date
                  ? new Date(`${goal.target_date}T12:00:00.000Z`).toLocaleDateString("en-US", {
                      weekday: "short",
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "Not set"}
              </Text>
            </View>
            {goal.target_date ? (
              <Text className="text-sm text-muted-foreground">{weeksUntil} weeks until target</Text>
            ) : null}
            <Button variant="outline" onPress={() => setShowGoalEditor(true)}>
              <Text>{isValid ? "Edit Goal" : "Add Goal"}</Text>
            </Button>
          </CardContent>
        </Card>

        {!isValid ? (
          <Card className="bg-destructive/10 border-destructive/20">
            <CardContent className="p-4">
              <Text className="text-sm text-destructive">
                Add an event name and target date to continue.
              </Text>
            </CardContent>
          </Card>
        ) : null}
      </WizardStep>

      <GoalEditorModal
        visible={showGoalEditor}
        title="Primary Goal"
        submitLabel="Apply Goal"
        initialValue={{
          ...createEmptyGoalDraft(),
          title: goal.name,
          targetDate: goal.target_date,
          importance: 8,
          goalType: "race_performance",
        }}
        onClose={() => setShowGoalEditor(false)}
        onSubmit={(draft) => {
          onGoalChange({
            ...goal,
            name: draft.title,
            target_date: draft.targetDate,
          });
          setShowGoalEditor(false);
        }}
      />
    </>
  );
}
