import { TrainingPlanComposerScreen } from "@/components/training-plan/create/TrainingPlanComposerScreen";
import { Text } from "../../../components/ui/text";
import { ROUTES } from "../../../lib/constants/routes";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, View } from "react-native";

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

export default function TrainingPlanEditRoute() {
  const { id, initialTab, section } = useLocalSearchParams<{
    id?: string;
    initialTab?: string;
    section?: string;
  }>();
  const router = useRouter();
  const hasValidId = Boolean(id && isUuid(id));

  const resolvedInitialTab = (() => {
    const tab = (initialTab || "").toLowerCase();
    if (
      tab === "plan" ||
      tab === "availability" ||
      tab === "constraints" ||
      tab === "calibration" ||
      tab === "review"
    ) {
      return tab as
        | "plan"
        | "availability"
        | "constraints"
        | "calibration"
        | "review";
    }

    if ((section || "").toLowerCase() === "overview") {
      return "plan" as const;
    }

    return "plan" as const;
  })();

  if (!hasValidId) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-lg font-semibold">Missing plan id</Text>
        <Text className="mt-2 text-center text-sm text-muted-foreground">
          Open a valid training plan before editing structure.
        </Text>
        <Pressable
          className="mt-4 rounded-md bg-primary px-4 py-2"
          onPress={() => router.replace(ROUTES.PLAN.INDEX)}
        >
          <Text className="font-semibold text-primary-foreground">
            Back to plan
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <TrainingPlanComposerScreen
      mode="edit"
      planId={id as string}
      initialTab={resolvedInitialTab}
    />
  );
}
