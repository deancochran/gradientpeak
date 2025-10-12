import { PlannedActivitiesList } from "@/components/PlannedActivitiesList";
import { QuickStartList } from "@/components/QuickStartList";
import { TemplatesList } from "@/components/TemplatesList";
import { Icon } from "@/components/ui/icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import { ActivityPayload, ActivityType } from "@repo/core";
import { useRouter } from "expo-router";
import { Calendar, FileText, Zap } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Alert, ScrollView, View } from "react-native";

export default function RecordLauncher() {
  const router = useRouter();
  const [selectedTab, setSelectedTab] = useState("quick-start");

  // Clear store on mount to ensure fresh state
  useEffect(() => {
    console.log("[RecordLauncher] Clearing activity selection store");
    activitySelectionStore.clear();
  }, []);

  // Handle activity selection and navigation
  const handleActivitySelected = (payload: ActivityPayload) => {
    try {
      console.log("[RecordLauncher] Activity selected:", payload);

      // Store the selection
      activitySelectionStore.setSelection(payload);

      // Navigate to record screen (no parameters!)
      router.push("/record");
    } catch (error) {
      console.error(
        "[RecordLauncher] Error handling activity selection:",
        error,
      );
      Alert.alert("Error", "Failed to start activity. Please try again.");
    }
  };

  // Quick start activity selection
  const handleQuickStart = (activityType: ActivityType) => {
    const payload: ActivityPayload = {
      type: activityType,
      // No plannedActivityId or plan for quick start
    };
    handleActivitySelected(payload);
  };

  // Template activity selection
  // Note: Templates always have structure, but routing depends on activity type
  // Swim, strength, and other activities go to follow-along screen automatically
  const handleTemplateSelected = (template: any) => {
    const payload: ActivityPayload = {
      type: template.activity_type,
      plan: template, // template is already a RecordingServiceActivityPlan
    };
    handleActivitySelected(payload);
  };

  // Planned activity selection
  // Note: Planned activities always have structure, but routing depends on activity type
  // Swim, strength, and other activities go to follow-along screen automatically
  const handlePlannedActivitySelected = (plannedActivity: any) => {
    const payload: ActivityPayload = {
      type: plannedActivity.activity_type,
      plannedActivityId: plannedActivity.id,
      plan: plannedActivity.plan, // plannedActivity.plan is already a RecordingServiceActivityPlan
    };
    handleActivitySelected(payload);
  };

  return (
    <View className="flex-1 bg-background">
      {/* Main Content */}
      <Tabs
        value={selectedTab}
        onValueChange={setSelectedTab}
        className="flex-1"
      >
        {/* Tab Navigation */}
        <View className="px-4 py-3 border-b border-border">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger
              value="quick-start"
              className="flex-row items-center gap-2"
            >
              <Icon as={Zap} size={16} />
              <Text className="text-sm font-medium">Quick Start</Text>
            </TabsTrigger>
            <TabsTrigger
              value="templates"
              className="flex-row items-center gap-2"
            >
              <Icon as={FileText} size={16} />
              <Text className="text-sm font-medium">Templates</Text>
            </TabsTrigger>
            <TabsTrigger
              value="planned"
              className="flex-row items-center gap-2"
            >
              <Icon as={Calendar} size={16} />
              <Text className="text-sm font-medium">Planned</Text>
            </TabsTrigger>
          </TabsList>
        </View>

        {/* Tab Content */}
        <ScrollView className="flex-1">
          {/* Quick Start Tab */}
          <TabsContent value="quick-start" className="flex-1 mt-0">
            <View className="p-4">
              <QuickStartList onActivitySelect={handleQuickStart} />
            </View>
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates" className="flex-1 mt-0">
            <View className="p-4">
              <TemplatesList onTemplateSelect={handleTemplateSelected} />
            </View>
          </TabsContent>

          {/* Planned Activities Tab */}
          <TabsContent value="planned" className="flex-1 mt-0">
            <View className="p-4">
              <PlannedActivitiesList
                onActivitySelect={handlePlannedActivitySelected}
              />
            </View>
          </TabsContent>
        </ScrollView>
      </Tabs>
    </View>
  );
}
