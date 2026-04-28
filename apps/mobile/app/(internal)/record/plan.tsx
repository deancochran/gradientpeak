/**
 * Activity Plan Picker Page
 *
 * Full-screen page for selecting or detaching an activity plan.
 * Accessed via navigation from the control dock quick actions.
 *
 * Features:
 * - Display accessible public and user-owned activity plans
 * - Search and filter functionality
 * - "Detach Plan" option if plan currently attached
 * - During an active recording, only plans matching the active activity category can attach
 * - Standard back navigation via header
 * - Recording continues in background
 */

import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import {
  type ActivityCategory,
  activityPlanStructureSchemaV2,
  type RecordingServiceActivityPlan,
} from "@repo/core";
import { EmptyStateCard } from "@repo/ui/components/empty-state-card";
import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { router } from "expo-router";
import { CalendarDays, Check, Search, Trash2 } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { api } from "@/lib/api";
import { useRecordingState } from "@/lib/hooks/useActivityRecorder";
import { useRecordingSessionContract } from "@/lib/hooks/useRecordingConfig";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ActivityPlanListItem = RouterOutputs["activityPlans"]["list"]["items"][number];

const CATEGORY_OPTIONS: {
  value: ActivityCategory | "all";
  label: string;
}[] = [
  { value: "all", label: "All Categories" },
  { value: "run", label: "Run" },
  { value: "bike", label: "Bike" },
  { value: "swim", label: "Swim" },
  { value: "strength", label: "Strength" },
  { value: "other", label: "Other" },
];

export default function PlanPickerPage() {
  const service = useSharedActivityRecorder();
  const recordingState = useRecordingState(service);
  const sessionContract = useRecordingSessionContract(service);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ActivityCategory | "all">("all");

  const { data: plans, isLoading } = api.activityPlans.list.useInfiniteQuery(
    {
      includeOwnOnly: false,
      ownerScope: "all",
      limit: 100,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const isSetupLocked = recordingState !== "pending" && recordingState !== "ready";
  const canEditPlan = sessionContract?.editing.canEditPlan ?? true;
  const hasPlan = sessionContract?.guidance.hasPlan ?? false;
  const activeCategory = service?.selectedActivityCategory;
  const plansList = React.useMemo(() => plans?.pages.flatMap((page) => page.items) ?? [], [plans]);

  const filteredPlans = React.useMemo(() => {
    return plansList.filter((plan) => {
      if (isSetupLocked && activeCategory && plan.activity_category !== activeCategory) {
        return false;
      }

      // Category filter
      if (categoryFilter !== "all" && plan.activity_category !== categoryFilter) {
        return false;
      }

      // Search filter (searches name and description)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const name = plan.name?.toLowerCase() || "";
        const description = plan.description?.toLowerCase() || "";

        if (!name.includes(query) && !description.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [activeCategory, categoryFilter, isSetupLocked, plansList, searchQuery]);

  const attachPlan = useCallback(
    async (planData: ActivityPlanListItem) => {
      if (!service || !canEditPlan) {
        return false;
      }

      if (isSetupLocked && planData.activity_category !== service.selectedActivityCategory) {
        return false;
      }

      const parsedStructure = activityPlanStructureSchemaV2.parse(planData.structure);

      const selectedPlan: RecordingServiceActivityPlan = {
        id: planData.id,
        name: planData.name,
        description: planData.description ?? "",
        structure: parsedStructure,
        activity_category:
          (planData.activity_category as ActivityCategory) || service.selectedActivityCategory,
        route_id: planData.route_id ?? null,
      };

      service.selectPlan(selectedPlan);
      return true;
    },
    [canEditPlan, isSetupLocked, service],
  );

  const handlePlanPress = useCallback(
    async (planData: ActivityPlanListItem) => {
      if (await attachPlan(planData)) {
        router.back();
      }
    },
    [attachPlan],
  );

  // Handle detach plan
  const handleDetach = useCallback(() => {
    if (!canEditPlan) return;

    service?.clearPlan();
    router.back();
  }, [canEditPlan, service]);

  const currentPlanId = service?.plan?.id ?? null;

  return (
    <View className="flex-1 bg-background" testID="record-plan-screen">
      <ScrollView className="flex-1 px-4 pt-4">
        {!isLoading ? <View testID="record-plan-content-ready" /> : null}
        {/* Search Input */}
        <View className="mb-3">
          <View className="relative">
            <Icon
              as={Search}
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10"
              style={{ top: "50%", transform: [{ translateY: -9 }] }}
            />
            <Input
              placeholder="Search plans..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              className="pl-10"
              testID="record-plan-search-input"
            />
          </View>
        </View>

        {/* Category Filter Dropdown */}
        <View className="mb-3">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
            <View className="flex-row gap-2">
              {CATEGORY_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => setCategoryFilter(option.value)}
                  testID={`record-plan-filter-${option.value}`}
                  className="px-3 py-2 rounded-full border border-border"
                  style={{
                    backgroundColor:
                      categoryFilter === option.value ? "rgb(34, 197, 94)" : undefined,
                  }}
                >
                  <Text
                    className="text-sm font-medium"
                    style={{
                      color: categoryFilter === option.value ? "white" : undefined,
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Loading State */}
        {isLoading && (
          <View className="items-center justify-center py-8" testID="record-plan-loading">
            <ActivityIndicator size="large" />
            <Text className="text-sm text-muted-foreground mt-2">Loading plans...</Text>
          </View>
        )}

        {!canEditPlan && (
          <View className="mb-3 rounded-lg border border-border bg-card p-4">
            <Text className="text-base font-medium text-foreground">
              Plan setup is locked after recording starts
            </Text>
            <Text className="mt-1 text-sm text-muted-foreground">
              Finish this workout to change or detach the attached plan.
            </Text>
          </View>
        )}

        {canEditPlan && hasPlan ? (
          <View className="mb-3 rounded-lg border border-border bg-card p-4">
            <Text className="text-base font-medium text-foreground">
              Current workout is plan-led
            </Text>
            <Text className="mt-1 text-sm text-muted-foreground">
              During recording you can remove this plan or attach another plan that matches the
              active activity category.
            </Text>
          </View>
        ) : null}

        {/* Detach Plan Option (if plan attached) */}
        {!isLoading && hasPlan && canEditPlan && (
          <Pressable
            onPress={handleDetach}
            testID="record-plan-detach-button"
            className="bg-card p-4 rounded-lg border border-border mb-3"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Icon as={Trash2} size={16} className="text-destructive" />
                  <Text className="text-base font-medium text-destructive">
                    Remove Activity Plan
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>
        )}

        {/* Activity Plans List */}
        {!isLoading && filteredPlans.length > 0 ? (
          <View className="gap-3 pb-6">
            {filteredPlans.map((plan) => (
              <ActivityPlanListItemRow
                key={plan.id}
                plan={plan}
                isSelected={plan.id === currentPlanId}
                disabled={!canEditPlan}
                onPress={() => handlePlanPress(plan)}
              />
            ))}
          </View>
        ) : (
          !isLoading && (
            <View testID="record-plan-empty-state">
              <EmptyStateCard
                icon={CalendarDays}
                title={
                  searchQuery || categoryFilter !== "all"
                    ? "No matching activity plans found"
                    : "No activity plans available"
                }
                description={
                  searchQuery || categoryFilter !== "all"
                    ? "Try adjusting your search or filter"
                    : "Create or save activity plans from the Plan tab"
                }
                iconSize={32}
              />
            </View>
          )
        )}
      </ScrollView>
    </View>
  );
}

/**
 * Planned Activity List Item Component
 */
interface ActivityPlanListItemRowProps {
  plan: ActivityPlanListItem;
  isSelected: boolean;
  disabled?: boolean;
  onPress: () => void;
}

function ActivityPlanListItemRow({
  plan,
  isSelected,
  disabled = false,
  onPress,
}: ActivityPlanListItemRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={`record-plan-item-${plan.id}`}
      className="bg-card p-4 rounded-lg border border-border"
      style={{
        borderColor: isSelected ? "rgb(34, 197, 94)" : undefined,
        borderWidth: isSelected ? 2 : 1,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <View className="flex-row items-center gap-2 mb-1">
            <Text className="text-xs text-muted-foreground capitalize">
              {plan.activity_category}
            </Text>
            <Text className="text-xs text-muted-foreground">•</Text>
            <Text className="text-xs text-muted-foreground">
              {plan.template_visibility === "public" ? "Public" : "Private"}
            </Text>
          </View>
          <Text className="text-base font-medium">{plan.name || "Unnamed Activity Plan"}</Text>
          {plan.description && (
            <Text className="text-sm text-muted-foreground mt-1">{plan.description}</Text>
          )}
        </View>

        {isSelected && <Icon as={Check} size={20} className="text-green-500 ml-2" />}
      </View>
    </Pressable>
  );
}
