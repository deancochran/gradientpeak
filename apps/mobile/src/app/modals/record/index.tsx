import { useRouter } from "expo-router";
import {
  Activity,
  Bluetooth,
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  Shield,
  Square,
} from "lucide-react-native";
import React, { useEffect, useMemo } from "react";
import { Alert, BackHandler, View } from "react-native";

import { RecordingCarousel } from "@/components/RecordingCarousel";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  useActivityRecorder,
  useLiveMetrics,
  usePlan,
  useRecorderActions,
  useRecordingState,
  useSensors,
} from "@/lib/hooks/useActivityRecorder";
import { useRequireAuth } from "@/lib/hooks/useAuth";
import { PublicActivityType } from "@repo/core";

const isOutdoorActivity = (type: PublicActivityType): boolean =>
  ["outdoor_run", "outdoor_bike", "outdoor_walk"].includes(type);

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
  const { profile } = useRequireAuth();

  // Service - auto-creates when profile is available
  const service = useActivityRecorder(profile || null);

  // State and metrics
  const state = useRecordingState(service);
  const metrics = useLiveMetrics(service);
  const { count: sensorCount } = useSensors(service);
  const {
    plan: activityPlan,
    progress: planProgress,
    activityType,
  } = usePlan(service);
  const { start, pause, resume, finish, advanceStep, isAdvancing } =
    useRecorderActions(service);

  // GPS metrics
  const { latitude, longitude, altitude } = metrics;
  const hasGPS = latitude !== undefined && longitude !== undefined;

  // Determine which cards to show
  const cards = useMemo((): CarouselCard[] => {
    const cardList: CarouselCard[] = [
      "dashboard",
      "power",
      "heartrate",
      "analysis",
      "elevation",
    ];

    if (isOutdoorActivity(activityType)) {
      cardList.push("map");
    }

    if (activityPlan) {
      cardList.push("plan");
    }

    return cardList;
  }, [activityType, activityPlan]);

  // Determine if modal can be closed
  const canClose = state === "pending" || state === "finished";

  // Back handler
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (canClose) {
          router.back();
          return true;
        } else {
          Alert.alert(
            "Recording in Progress",
            "Please pause and finish your recording before leaving.",
            [{ text: "OK" }],
          );
          return true;
        }
      },
    );
    return () => backHandler.remove();
  }, [router, canClose]);

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="bg-background border-b border-border p-4">
        <View className="flex-row items-center justify-between">
          {/* Left - Back/Close */}
          {canClose ? (
            <Button size="icon" variant="ghost" onPress={() => router.back()}>
              <Icon as={ChevronDown} size={24} />
            </Button>
          ) : (
            <View className="w-10" />
          )}

          {/* Center - Title */}
          <View className="flex-1 items-center">
            <Text className="font-semibold text-lg">
              {state === "pending" ? "Record Activity" : "Recording"}
            </Text>
            {state !== "pending" && (
              <Text className="text-xs text-muted-foreground capitalize">
                {state === "recording" ? "Active" : state}
              </Text>
            )}
          </View>

          {/* Right - Icons */}
          <View className="flex-row gap-1">
            {/* Activity Selection */}
            <Button
              variant="ghost"
              size="icon"
              onPress={() => router.push("/modals/record/activity")}
              disabled={state !== "pending"}
            >
              <Icon as={Activity} size={20} />
            </Button>

            {/* Permissions */}
            <Button
              variant="ghost"
              size="icon"
              onPress={() => router.push("/modals/record/permissions")}
            >
              <Icon as={Shield} size={20} />
              {hasGPS && (
                <View className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
              )}
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
      <RecordingCarousel
        cards={cards}
        service={service}
        state={state}
        activityType={activityType}
        planProgress={planProgress}
        activityPlan={activityPlan}
        latitude={latitude}
        longitude={longitude}
        altitude={altitude}
      />

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
            {activityPlan && advanceStep && (
              <Button
                onPress={advanceStep}
                variant="outline"
                className="w-full h-12 rounded-xl"
                disabled={isAdvancing}
              >
                <Icon as={ChevronRight} size={20} />
                <Text className="ml-2 font-medium">
                  {isAdvancing ? "Advancing..." : "Next Step"}
                </Text>
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
