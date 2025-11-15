import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { Calendar, Clock, Copy, Play, Zap } from "lucide-react-native";
import { ScrollView, View } from "react-native";

interface PlanDetailModalProps {
  planId: string;
  isVisible: boolean;
  onClose: () => void;
  scheduleIntent?: boolean;
}

export function PlanDetailModal({
  planId,
  isVisible,
  onClose,
  scheduleIntent = false,
}: PlanDetailModalProps) {
  const router = useRouter();

  // Query plan details
  const { data: plan, isLoading } = trpc.activityPlans.getById.useQuery(
    { id: planId },
    { enabled: isVisible && !!planId },
  );

  const handleSchedule = () => {
    router.push({
      pathname: "/(internal)/(tabs)/plan/create_planned_activity",
      params: { planId },
    });
    onClose();
  };

  const handleStartNow = () => {
    if (!plan) return;

    // Launch ActivityRecorder with the plan
    const payload = {
      type: plan.activity_type,
      plan,
    };

    router.push({
      pathname: "/(internal)/record",
      params: { payload: JSON.stringify(payload) },
    });
    onClose();
  };

  const handleDuplicate = () => {
    router.push({
      pathname: "/(internal)/(tabs)/plan/create_planned_activity",
      params: { templateId: planId },
    });
    onClose();
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
  };

  const renderActivityStructure = () => {
    if (
      !plan?.structure ||
      typeof plan.structure !== "object" ||
      !("steps" in plan.structure) ||
      !Array.isArray(plan.structure.steps) ||
      plan.structure.steps.length === 0
    ) {
      return (
        <Text className="text-sm text-muted-foreground italic">
          No activity structure available
        </Text>
      );
    }

    return (
      <View className="flex flex-col gap-2">
        {(plan.structure.steps as any[]).map((step: any, index: number) => {
          if (step.type === "step") {
            return (
              <View
                key={index}
                className="bg-background border border-border rounded-lg p-3"
              >
                <View className="flex flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="font-medium">
                      {step.name || `Step ${index + 1}`}
                    </Text>
                    {step.description && (
                      <Text className="text-sm text-muted-foreground mt-1">
                        {step.description}
                      </Text>
                    )}
                  </View>

                  {step.duration && step.duration !== "untilFinished" && (
                    <View className="ml-2">
                      <Text className="text-sm font-medium">
                        {step.duration.value} {step.duration.unit}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Targets */}
                {step.targets && step.targets.length > 0 && (
                  <View className="flex flex-row flex-wrap gap-2 mt-2">
                    {step.targets.map((target: any, targetIndex: number) => (
                      <View
                        key={targetIndex}
                        className="bg-primary/10 px-2 py-1 rounded-full"
                      >
                        <Text className="text-xs text-primary font-medium">
                          {target.intensity}
                          {target.type === "%FTP" && "% FTP"}
                          {target.type === "%MaxHR" && "% Max HR"}
                          {target.type === "%ThresholdHR" && "% Threshold"}
                          {target.type === "watts" && "W"}
                          {target.type === "bpm" && " bpm"}
                          {target.type === "RPE" && "/10 RPE"}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Notes */}
                {step.notes && (
                  <Text className="text-xs text-muted-foreground mt-2 italic">
                    {step.notes}
                  </Text>
                )}
              </View>
            );
          } else if (step.type === "repetition") {
            return (
              <View
                key={index}
                className="bg-orange-50 border border-orange-200 rounded-lg p-3"
              >
                <View className="flex flex-row items-center gap-2 mb-2">
                  <View className="bg-orange-500 w-2 h-2 rounded-full" />
                  <Text className="font-medium">
                    Repeat {step.repeat} times:
                  </Text>
                </View>
                <View className="flex flex-col gap-1 ml-4">
                  {step.steps.map((subStep: any, subIndex: number) => (
                    <Text key={subIndex} className="text-sm">
                      • {subStep.name || `Step ${subIndex + 1}`}
                      {subStep.duration &&
                        subStep.duration !== "untilFinished" &&
                        ` (${subStep.duration.value} ${subStep.duration.unit})`}
                    </Text>
                  ))}
                </View>
              </View>
            );
          }
          return null;
        })}
      </View>
    );
  };

  if (!plan && !isLoading) {
    return (
      <Dialog open={isVisible} onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Plan Not Found</DialogTitle>
            <DialogDescription>
              This activity plan could not be found.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onPress={onClose}>
              <Text>Close</Text>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isVisible} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full max-w-lg mx-4 max-h-[85%]">
        <DialogHeader>
          <DialogTitle>{plan?.name || "Loading..."}</DialogTitle>
          <DialogDescription>
            {plan?.description || "Activity plan details"}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <View className="flex items-center justify-center py-8">
            <Text className="text-muted-foreground">
              Loading plan details...
            </Text>
          </View>
        ) : (
          <ScrollView className="max-h-96">
            <View className="flex flex-col gap-4 py-4">
              {/* Plan Summary */}
              <View className="bg-muted/30 rounded-lg p-4">
                <View className="flex flex-row justify-between items-start mb-2">
                  <Text className="font-semibold">Plan Overview</Text>
                  {plan?.activity_type && (
                    <Text className="text-sm text-muted-foreground capitalize">
                      {plan.activity_type.replace(/_/g, " ")}
                    </Text>
                  )}
                </View>

                <View className="flex flex-row gap-6">
                  {plan?.estimated_duration && (
                    <View className="flex items-center">
                      <Icon
                        as={Clock}
                        size={20}
                        className="text-muted-foreground mb-1"
                      />
                      <Text className="text-sm font-medium">
                        {formatDuration(plan.estimated_duration)}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        Duration
                      </Text>
                    </View>
                  )}

                  {plan?.estimated_tss && (
                    <View className="flex items-center">
                      <Icon
                        as={Zap}
                        size={20}
                        className="text-muted-foreground mb-1"
                      />
                      <Text className="text-sm font-medium">
                        {plan.estimated_tss}
                      </Text>
                      <Text className="text-xs text-muted-foreground">TSS</Text>
                    </View>
                  )}

                  {plan?.structure &&
                    typeof plan.structure === "object" &&
                    "steps" in plan.structure &&
                    Array.isArray(plan.structure.steps) && (
                      <View className="flex items-center">
                        <View className="w-5 h-5 bg-muted-foreground rounded-full flex items-center justify-center mb-1">
                          <Text className="text-xs text-background font-bold">
                            {(plan.structure.steps as any[]).length}
                          </Text>
                        </View>
                        <Text className="text-xs text-muted-foreground">
                          Steps
                        </Text>
                      </View>
                    )}
                </View>
              </View>

              {/* Activity Structure */}
              <View className="bg-muted/30 rounded-lg p-4">
                <Text className="font-semibold mb-3">Activity Structure</Text>
                {renderActivityStructure()}
              </View>
            </View>
          </ScrollView>
        )}

        <DialogFooter className="flex flex-row gap-2">
          <Button variant="outline" onPress={onClose} disabled={isLoading}>
            <Text>Close</Text>
          </Button>

          <Button
            variant="outline"
            onPress={handleDuplicate}
            disabled={isLoading}
          >
            <Icon as={Copy} size={16} className="text-foreground" />
            <Text>Duplicate & Edit</Text>
          </Button>

          <Button
            variant="outline"
            onPress={handleStartNow}
            disabled={isLoading}
          >
            <Icon as={Play} size={16} className="text-foreground" />
            <Text>Start Now</Text>
          </Button>

          <Button
            onPress={handleSchedule}
            disabled={isLoading}
            className={scheduleIntent ? "bg-primary" : ""}
          >
            <Icon as={Calendar} size={16} className="text-primary-foreground" />
            <Text className="text-primary-foreground">
              {scheduleIntent ? "Schedule This Activity" : "Schedule"}
            </Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
