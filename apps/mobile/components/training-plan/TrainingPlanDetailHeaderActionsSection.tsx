import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Switch } from "@repo/ui/components/switch";
import { Text } from "@repo/ui/components/text";
import { ChevronRight, Copy, Eye, EyeOff, Heart } from "lucide-react-native";
import React from "react";
import { Pressable, TouchableOpacity, View } from "react-native";
import { TrainingPlanSummaryHeader } from "./TrainingPlanSummaryHeader";
import { TrainingPlanTemplateSchedulingDialog } from "./TrainingPlanTemplateSchedulingDialog";

function TrainingPlanDetailChip({ label }: { label: string }) {
  return (
    <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
      <Text className="text-xs font-medium capitalize text-foreground">{label}</Text>
    </View>
  );
}

interface TrainingPlanDetailHeaderActionsSectionProps {
  duplicatePending: boolean;
  handleDuplicate: () => void;
  handleEditStructure: () => void;
  handleToggleLike: () => void;
  handleTogglePrivacy: () => void;
  isLiked: boolean;
  isOwnedByUser: boolean;
  isPublic: boolean;
  likesCount: number;
  onOpenCalendar: () => void;
  plan: any;
  schedulingDialogProps: React.ComponentProps<typeof TrainingPlanTemplateSchedulingDialog>;
  visibilityPending: boolean;
}

export function TrainingPlanDetailHeaderActionsSection({
  duplicatePending,
  handleDuplicate,
  handleEditStructure,
  handleToggleLike,
  handleTogglePrivacy,
  isLiked,
  isOwnedByUser,
  isPublic,
  likesCount,
  onOpenCalendar,
  plan,
  schedulingDialogProps,
  visibilityPending,
}: TrainingPlanDetailHeaderActionsSectionProps) {
  return (
    <>
      <TrainingPlanSummaryHeader
        title={plan.name}
        description={plan.description || undefined}
        isActive={false}
        inactiveLabel="Template"
        createdAt={plan.created_at}
        showStatusDot={false}
        formatStartedDate={(date) =>
          date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        }
        rightAccessory={
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={handleToggleLike}
              className="flex-row items-center bg-primary/10 rounded-full px-3 py-2 gap-1"
            >
              <Icon
                as={Heart}
                size={18}
                className={isLiked ? "text-red-500 fill-red-500" : "text-primary"}
              />
              {likesCount > 0 && (
                <Text className="text-sm font-medium text-primary">{likesCount}</Text>
              )}
            </Pressable>
            {isOwnedByUser && (
              <TouchableOpacity onPress={handleEditStructure} className="ml-1">
                <View className="bg-primary/10 rounded-full p-2">
                  <Icon as={ChevronRight} size={24} className="text-primary" />
                </View>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      <Card className="mt-3">
        <CardContent className="p-3 gap-3">
          <View className="gap-1">
            <Text className="text-sm font-semibold">Plan snapshot</Text>
            <Text className="text-xs text-muted-foreground">
              Understand the commitment first, then decide whether to schedule sessions or make an
              editable copy.
            </Text>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {plan.durationWeeks?.recommended || plan.durationWeeks?.min ? (
              <TrainingPlanDetailChip
                label={`${plan.durationWeeks?.recommended || plan.durationWeeks?.min} week${(plan.durationWeeks?.recommended || plan.durationWeeks?.min) === 1 ? "" : "s"}`}
              />
            ) : null}
            {plan.sessions_per_week_target ? (
              <TrainingPlanDetailChip label={`${plan.sessions_per_week_target} sessions/week`} />
            ) : null}
            {Array.isArray(plan.sport)
              ? plan.sport
                  .slice(0, 2)
                  .map((sport: string) => <TrainingPlanDetailChip key={sport} label={sport} />)
              : null}
            {Array.isArray(plan.experienceLevel)
              ? plan.experienceLevel
                  .slice(0, 1)
                  .map((level: string) => <TrainingPlanDetailChip key={level} label={level} />)
              : typeof plan.experienceLevel === "string"
                ? [
                    <TrainingPlanDetailChip
                      key={plan.experienceLevel}
                      label={plan.experienceLevel}
                    />,
                  ]
                : null}
          </View>
        </CardContent>
      </Card>

      <Card className="mt-3">
        <CardContent className="p-3 gap-3">
          <View className="gap-1">
            <Text className="text-sm font-semibold">Plan Actions</Text>
            <Text className="text-xs text-muted-foreground">
              Get this plan onto your calendar first, then use editing only when you need to
              customize it.
            </Text>
            {!isOwnedByUser ? (
              <Text className="text-xs text-muted-foreground">
                Shared plans stay read-only here. Make an editable copy if you want to customize the
                structure first.
              </Text>
            ) : null}
          </View>

          {isOwnedByUser && (
            <View className="flex-row items-center justify-between bg-muted/30 rounded-lg p-3">
              <View className="flex-row items-center gap-2">
                <Icon as={isPublic ? Eye : EyeOff} size={18} className="text-muted-foreground" />
                <View>
                  <Text className="text-sm font-medium">{isPublic ? "Public" : "Private"}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {isPublic
                      ? "Anyone can find and use this template"
                      : "Only you can see this template"}
                  </Text>
                </View>
              </View>
              <Switch
                checked={isPublic}
                onCheckedChange={handleTogglePrivacy}
                disabled={visibilityPending}
              />
            </View>
          )}

          <View className="flex-row gap-2">
            {isOwnedByUser ? (
              <Button
                variant="outline"
                onPress={handleEditStructure}
                className="flex-1"
                testID="training-plan-edit-button"
              >
                <Text>Edit Plan</Text>
              </Button>
            ) : (
              <Button
                variant="outline"
                onPress={handleDuplicate}
                disabled={duplicatePending}
                className="flex-1"
                testID="training-plan-duplicate-button"
              >
                <Icon as={Copy} size={16} className="text-foreground mr-2" />
                <Text className="text-foreground font-medium">
                  {duplicatePending ? "Duplicating..." : "Make Editable Copy"}
                </Text>
              </Button>
            )}
            <Button
              variant="outline"
              onPress={onOpenCalendar}
              className="flex-1"
              testID="training-plan-open-calendar-button"
            >
              <Text>Open Calendar</Text>
            </Button>
          </View>

          <TrainingPlanTemplateSchedulingDialog {...schedulingDialogProps} />
        </CardContent>
      </Card>
    </>
  );
}
