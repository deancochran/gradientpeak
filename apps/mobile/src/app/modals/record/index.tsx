import { useRouter } from "expo-router";
import {
  Bluetooth,
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  Shield,
  Square,
} from "lucide-react-native";
import React, { useEffect, useMemo } from "react";
import { View } from "react-native";

import { RecordingCarousel } from "@/components/RecordingCarousel";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  useActivityStatus,
  usePlan,
  useRecorderActions,
  useRecordingState,
  useSensors,
} from "@/lib/hooks/useActivityRecorder";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import {
  ACTIVITY_ICONS,
  ACTIVITY_NAMES,
} from "@/lib/services/ActivityRecorder/types";

type CarouselCard =
  | "dashboard"
  | "power"
  | "heartrate"
  | "analysis"
  | "elevation"
  | "map"
  | "plan";

export default function RecordModal() {
  const router = useRouter();

  // Use shared service from context (provided by _layout.tsx)
  const service = useSharedActivityRecorder();

  // State and actions
  const state = useRecordingState(service);
  const { count: sensorCount } = useSensors(service);
  const plan = usePlan(service);
  const { isOutdoorActivity, activityType } = useActivityStatus(service);
  const { start, pause, resume, finish } = useRecorderActions(service);

  // Debug: Track activity status changes
  useEffect(() => {
    console.log("[RecordModal] Activity status changed:", {
      isOutdoorActivity,
      hasPlan: plan.hasPlan,
    });
  }, [isOutdoorActivity, plan.hasPlan]);

  // Determine which cards to show - reactively updates based on activity status
  const cards = useMemo((): CarouselCard[] => {
    const cardList: CarouselCard[] = [
      "dashboard",
      "power",
      "heartrate",
      "analysis",
      "elevation",
    ];

    if (isOutdoorActivity) {
      cardList.push("map");
      console.log("[RecordModal] Adding map card for outdoor activity");
    }

    if (plan.hasPlan) {
      cardList.push("plan");
      console.log("[RecordModal] Adding plan card");
    }

    console.log("[RecordModal] Cards updated:", cardList);
    return cardList;
  }, [isOutdoorActivity, plan.hasPlan]);

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="bg-background border-b border-border p-4">
        <View className="flex-row items-center gap-2 justify-between">
          <View className="flex-row w-1/2">
            {/* Left - Back/Close */}
            {(state === "pending" || state === "finished") && (
              <Button size="icon" variant="ghost" onPress={() => router.back()}>
                <Icon as={ChevronDown} size={24} />
              </Button>
            )}
            {/* Activity Selection */}
            <Button
              variant="ghost"
              onPress={() => router.push("/modals/record/activity")}
              disabled={state !== "pending"}
              className="w-full text-left justify-start"
            >
              <Icon as={ACTIVITY_ICONS[activityType]} size={20} />
              <Text className="font-semibold text-lg text-left">
                {plan.hasPlan ? plan.name : ACTIVITY_NAMES[activityType]}
              </Text>
            </Button>
          </View>

          {/* Right - Icons */}
          <View className="flex-row w-1/2 items-end justify-end">
            {/* Permissions */}
            <Button
              variant="ghost"
              size="icon"
              onPress={() => router.push("/modals/record/permissions")}
            >
              <Icon as={Shield} size={20} />
            </Button>

            {/* Sensors */}
            <Button
              variant="ghost"
              size="icon"
              onPress={() => router.push("/modals/record/sensors")}
            >
              <Icon as={Bluetooth} size={20} />
              {sensorCount > 0 && (
                <View className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />
              )}
            </Button>
          </View>
        </View>
      </View>

      {/* Carousel */}
      <RecordingCarousel cards={cards} service={service} />

      {/* Footer */}
      <View className="bg-background border-t border-border p-6 pb-8">
        {state === "pending" && (
          <Button onPress={start} className="w-full h-14 rounded-xl">
            <Icon as={Play} size={24} className="color-background" />
            <Text className="ml-3 font-semibold text-lg">Start Activity</Text>
          </Button>
        )}
        {state === "recording" && (
          <View className="gap-3">
            <Button
              onPress={pause}
              variant="secondary"
              className="w-full h-14 rounded-xl"
            >
              <Icon as={Pause} size={24} />
              <Text className="ml-3 font-semibold">Pause Activity</Text>
            </Button>
            {plan.hasPlan && plan.canAdvance && (
              <Button
                onPress={plan.advance}
                variant="outline"
                className="w-full h-12 rounded-xl"
              >
                <Icon as={ChevronRight} size={20} />
                <Text className="ml-2 font-medium">Next Step</Text>
              </Button>
            )}
          </View>
        )}

        {state === "paused" && (
          <View className="flex-row gap-3">
            <Button onPress={resume} className="flex-1 h-14 rounded-xl">
              <Icon as={Play} size={24} />
              <Text className="ml-3 font-semibold">Resume</Text>
            </Button>

            <Button
              onPress={finish}
              variant="secondary"
              className="flex-1 h-14 rounded-xl"
            >
              <Icon as={Square} size={24} />
              <Text className="ml-3 font-semibold">Finish</Text>
            </Button>
          </View>
        )}

        {state === "finished" && (
          <View className="items-center">
            <Text className="text-sm text-muted-foreground">finishing...</Text>
          </View>
        )}
      </View>
    </View>
  );
}
