import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { Calendar, Clock, Copy, Play, X, Zap } from "lucide-react-native";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

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

  const { data: plan, isLoading } = trpc.activityPlans.getById.useQuery(
    { id: planId },
    { enabled: isVisible && !!planId },
  );

  const handleSchedule = () => {
    router.push({
      pathname: "/plan/create_planned_activity" as any,
      params: { planId },
    });
    onClose();
  };

  const handleStartNow = () => {
    if (!plan) return;
    const payload = {
      type: plan.activity_type,
      plan,
    };
    router.push({
      pathname: "/(internal)/record" as any,
      params: { payload: JSON.stringify(payload) },
    });
    onClose();
  };

  const handleDuplicate = () => {
    router.push({
      pathname: "/plan/create_planned_activity" as any,
      params: { templateId: planId },
    });
    onClose();
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
  };

  const renderStep = (step: any, index: number) => {
    if (step.type === "step") {
      return (
        <View key={index} className="mb-3">
          <View className="flex-row items-start justify-between mb-1">
            <Text className="flex-1 font-medium">
              {step.name || `Step ${index + 1}`}
            </Text>
            {step.duration && step.duration !== "untilFinished" && (
              <Text className="text-sm text-muted-foreground ml-2">
                {step.duration.value}
                {step.duration.unit === "minutes" ? "m" : step.duration.unit}
              </Text>
            )}
          </View>

          {step.targets && step.targets.length > 0 && (
            <View className="flex-row flex-wrap gap-1.5 mt-1">
              {step.targets.map((target: any, idx: number) => (
                <View key={idx} className="bg-primary/10 px-2 py-0.5 rounded">
                  <Text className="text-xs text-primary">
                    {target.intensity}
                    {target.type === "%FTP" && "% FTP"}
                    {target.type === "%MaxHR" && "% HR"}
                    {target.type === "%ThresholdHR" && "% Threshold"}
                    {target.type === "watts" && "W"}
                    {target.type === "bpm" && " bpm"}
                    {target.type === "RPE" && " RPE"}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {step.notes && (
            <Text className="text-xs text-muted-foreground mt-1 italic">
              {step.notes}
            </Text>
          )}
        </View>
      );
    }

    if (step.type === "repetition") {
      return (
        <View
          key={index}
          className="mb-3 bg-orange-50 rounded-lg p-3 border-l-2 border-orange-400"
        >
          <Text className="font-medium text-sm mb-2">
            Repeat {step.repeat}×
          </Text>
          {step.steps.map((subStep: any, subIdx: number) => (
            <Text key={subIdx} className="text-sm text-muted-foreground ml-2">
              • {subStep.name || `Step ${subIdx + 1}`}
              {subStep.duration &&
                subStep.duration !== "untilFinished" &&
                ` (${subStep.duration.value}${subStep.duration.unit === "minutes" ? "m" : subStep.duration.unit})`}
            </Text>
          ))}
        </View>
      );
    }

    return null;
  };

  const steps = (plan?.structure as any)?.steps || [];
  const hasSteps = Array.isArray(steps) && steps.length > 0;

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
          <View className="flex-1 mr-3">
            <Text className="text-lg font-bold" numberOfLines={1}>
              {plan?.name || "Loading..."}
            </Text>
            {plan?.activity_type && (
              <Text className="text-xs text-muted-foreground capitalize mt-0.5">
                {plan.activity_type.replace(/_/g, " ")}
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            className="w-8 h-8 items-center justify-center"
          >
            <Icon as={X} size={24} className="text-muted-foreground" />
          </TouchableOpacity>
        </View>

        {/* Content */}
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" />
          </View>
        ) : !plan ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-muted-foreground text-center">
              Plan not found
            </Text>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16 }}
          >
            {/* Stats Row */}
            <View className="flex-row items-center gap-6 mb-4 pb-4 border-b border-border">
              {plan.estimated_duration && (
                <View className="items-center">
                  <Icon
                    as={Clock}
                    size={20}
                    className="text-muted-foreground mb-1"
                  />
                  <Text className="text-sm font-semibold">
                    {formatDuration(plan.estimated_duration)}
                  </Text>
                </View>
              )}

              {plan.estimated_tss && (
                <View className="items-center">
                  <Icon
                    as={Zap}
                    size={20}
                    className="text-muted-foreground mb-1"
                  />
                  <Text className="text-sm font-semibold">
                    {plan.estimated_tss}
                  </Text>
                  <Text className="text-xs text-muted-foreground">TSS</Text>
                </View>
              )}

              {hasSteps && (
                <View className="items-center">
                  <View className="w-5 h-5 bg-muted rounded-full items-center justify-center mb-1">
                    <Text className="text-xs font-bold">{steps.length}</Text>
                  </View>
                  <Text className="text-xs text-muted-foreground">Steps</Text>
                </View>
              )}
            </View>

            {/* Description */}
            {plan.description && (
              <View className="mb-4">
                <Text className="text-sm text-muted-foreground leading-5">
                  {plan.description}
                </Text>
              </View>
            )}

            {/* Steps */}
            {hasSteps ? (
              <View>
                <Text className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
                  Workout Structure
                </Text>
                {steps.map((step: any, idx: number) => renderStep(step, idx))}
              </View>
            ) : (
              <Text className="text-sm text-muted-foreground italic text-center py-8">
                No workout structure available
              </Text>
            )}
          </ScrollView>
        )}

        {/* Action Bar */}
        <View className="border-t border-border bg-background">
          <View className="px-4 py-3">
            {/* Primary Action */}
            <TouchableOpacity
              onPress={handleSchedule}
              activeOpacity={0.8}
              disabled={isLoading}
              className="bg-primary rounded-lg py-3.5 flex-row items-center justify-center mb-2"
            >
              <Icon
                as={Calendar}
                size={18}
                className="text-primary-foreground mr-2"
              />
              <Text className="text-primary-foreground font-semibold">
                {scheduleIntent ? "Schedule This Activity" : "Schedule"}
              </Text>
            </TouchableOpacity>

            {/* Secondary Actions */}
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={handleStartNow}
                activeOpacity={0.7}
                disabled={isLoading}
                className="flex-1 bg-muted rounded-lg py-2.5 flex-row items-center justify-center"
              >
                <Icon as={Play} size={16} className="text-foreground mr-1.5" />
                <Text className="text-foreground text-sm">Start Now</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleDuplicate}
                activeOpacity={0.7}
                disabled={isLoading}
                className="flex-1 bg-muted rounded-lg py-2.5 flex-row items-center justify-center"
              >
                <Icon as={Copy} size={16} className="text-foreground mr-1.5" />
                <Text className="text-foreground text-sm">Duplicate</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
