import { RecordingCarousel } from "@/components/RecordingCarousel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useRouter } from "expo-router";
import {
  Activity,
  Bluetooth,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Pause,
  Play,
  Shield,
  Square,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo } from "react";
import { View } from "react-native";

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

  // Handle finish action - navigate immediately
  const handleFinish = useCallback(async () => {
    console.log(
      "[RecordModal] Finish clicked, navigating to submit page immediately",
    );

    // Start the finish process but don't wait for it
    finish();

    // Navigate immediately to submit page
    router.push("/record/submit");
  }, [finish, router]);

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
      {/* Floating Close Button - Only shown when pending */}
      {state === "pending" && (
        <View className="absolute top-2 left-2 z-50">
          <Button
            size="icon"
            variant="ghost"
            onPress={() => router.back()}
            className="bg-muted text-muted-foreground/80 "
          >
            <Icon as={ChevronDown} size={24} />
          </Button>
        </View>
      )}
      {/* Carousel - Now takes full height */}
      <RecordingCarousel cards={cards} service={service} />
      {/* Footer */}
      <View className="bg-background px-4">
        {state === "pending" && (
          <View className="flex-row gap-3">
            <Button onPress={start} className="flex-1 h-14 rounded-xl">
              <Icon as={Play} size={24} className="color-background" />
              <Text className="ml-3 font-semibold text-lg">Start Activity</Text>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-14 w-14 rounded-xl"
                >
                  <Icon as={MoreVertical} size={24} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                insets={{ top: 0, bottom: 100, left: 0, right: 15 }}
                className="w-2/5"
                align="start"
              >
                <DropdownMenuItem
                  onPress={() => router.push("/record/activity")}
                >
                  <Icon as={Activity} size={20} className="mr-2" />
                  <Text>Select Activity</Text>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onPress={() => router.push("/record/sensors")}
                >
                  <Icon as={Bluetooth} size={20} className="mr-2" />
                  <Text>Sensors {sensorCount > 0 && `(${sensorCount})`}</Text>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onPress={() => router.push("/record/permissions")}
                >
                  <Icon as={Shield} size={20} className="mr-2" />
                  <Text>Permissions</Text>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </View>
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
              onPress={handleFinish}
              variant="secondary"
              className="flex-1 h-14 rounded-xl"
            >
              <Icon as={Square} size={24} />
              <Text className="ml-3 font-semibold">Finish</Text>
            </Button>
          </View>
        )}
      </View>
    </View>
  );
}
