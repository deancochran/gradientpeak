import {
  ActivityCategorySelector,
  ActivityLocationSelector,
} from "@/components/ActivityPlan/ActivityCategorySelector";
import { TimelineChart } from "@/components/ActivityPlan/TimelineChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { buildPlanRoute, ROUTES } from "@/lib/constants/routes";
import { useActivityPlanForm } from "@/lib/hooks/forms/useActivityPlanForm";
import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";
import { trpc } from "@/lib/trpc";
import { formatDuration } from "@/lib/utils/dates";
import {
  calculateActivityStatsV2,
  decodePolyline,
  type ActivityPlanStructureV2,
} from "@repo/core";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { MapPin, Upload, X } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import MapView, { Polyline, PROVIDER_DEFAULT } from "react-native-maps";

export default function CreateActivityPlanScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const editPlanId = params.planId as string | undefined;
  const isEditMode = !!editPlanId;
  const [uploadedGpxFile, setUploadedGpxFile] = useState<{
    name: string;
    content: string;
  } | null>(null);
  const [isUploadingRoute, setIsUploadingRoute] = useState(false);

  const utils = trpc.useUtils();
  const resetStore = useActivityPlanCreationStore((state) => state.reset);

  // Reset store when entering create mode (not edit mode)
  useEffect(() => {
    if (!isEditMode) {
      resetStore();
    }
  }, [isEditMode, resetStore]);
  const uploadRouteMutation = trpc.routes.upload.useMutation({
    onSuccess: (data) => {
      setRouteId(data.id);
      setUploadedGpxFile(null);
      setIsUploadingRoute(false);
      utils.routes.invalidate();
    },
    onError: (error) => {
      Alert.alert("Error", "Failed to upload route. Please try again.");
      setIsUploadingRoute(false);
    },
  });

  // Use form hook for state management and submission
  const {
    form,
    setName,
    setDescription,
    setActivityLocation,
    setActivityCategory,
    setRouteId,
    metrics,
    submit,
    cancel,
    isSubmitting,
    isLoading,
  } = useActivityPlanForm({
    planId: editPlanId,
    onSuccess: (planId) => {
      if (isEditMode) {
        Alert.alert("Success", "Activity plan updated successfully!");
        router.back();
      } else {
        Alert.alert("Success", "Activity plan created successfully!", [
          {
            text: "Schedule Now",
            onPress: () => {
              const route = buildPlanRoute(planId, "schedule");
              router.push(route.pathname as any);
            },
          },
          {
            text: "View Plan",
            onPress: () => {
              router.push(ROUTES.PLAN.PLAN_DETAIL(planId) as any);
            },
          },
        ]);
      }
    },
    onError: (error) => {
      Alert.alert(
        "Error",
        `Failed to ${isEditMode ? "update" : "save"} activity plan. Please try again.`,
      );
    },
  });

  const {
    name,
    description,
    activityLocation,
    activityCategory,
    structure,
    routeId,
  } = form;

  // Fetch route if one is selected
  const { data: route } = trpc.routes.get.useQuery(
    { id: routeId! },
    { enabled: !!routeId },
  );

  // Get direct access to store structure for chart display
  const storeStructure = useActivityPlanCreationStore(
    (state) => state.structure,
  );

  const intervals = useMemo(
    () => structure.intervals || [],
    [structure.intervals],
  );

  // Configure header with Save button and title
  useEffect(() => {
    navigation.setOptions({
      title: isEditMode ? "Edit Activity Plan" : "Create Activity Plan",
      headerRight: () => (
        <Button
          variant="ghost"
          size="sm"
          onPress={submit}
          disabled={isSubmitting || isLoading}
        >
          <Text className="text-primary font-semibold">
            {isSubmitting ? "Saving..." : "Save"}
          </Text>
        </Button>
      ),
    });
  }, [navigation, submit, isSubmitting, isLoading, isEditMode]);

  // Calculate additional metrics (TSS/IF) from V2 structure
  const additionalMetrics = useMemo(() => {
    if (intervals.length === 0) {
      return { tss: 0, if: 0 };
    }

    const structureV2: ActivityPlanStructureV2 = {
      version: 2,
      intervals,
    };

    const stats = calculateActivityStatsV2(structureV2);

    return {
      tss: stats.estimatedTSS,
      if: stats.avgPower / 100, // Convert avgPower (%FTP) to IF (0-1 scale)
    };
  }, [intervals]);

  /**
   * Handle navigating to structure editor
   */
  const handleEditStructure = () => {
    router.push(ROUTES.PLAN.CREATE_ACTIVITY_PLAN.STRUCTURE);
  };

  /**
   * Handle GPX file upload
   */
  const handlePickGpxFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/gpx+xml", "text/xml", "application/xml"],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const file = result.assets[0];

        // Read file content
        const response = await fetch(file.uri);
        const content = await response.text();

        setUploadedGpxFile({
          name: file.name,
          content: content,
        });

        // Automatically upload the route
        setIsUploadingRoute(true);
        const fileName = file.name.replace(/\.gpx$/i, "");

        uploadRouteMutation.mutate({
          name: fileName,
          description: `Uploaded for ${name || "activity plan"}`,
          activityCategory: activityCategory as any,
          fileContent: content,
          fileName: file.name,
        });
      }
    } catch (error) {
      Alert.alert("Error", "Failed to read GPX file");
    }
  };

  /**
   * Remove selected route
   */
  const handleRemoveRoute = () => {
    setRouteId(null);
    setUploadedGpxFile(null);
  };

  // Decode route coordinates if available
  const routeCoordinates = route?.polyline
    ? decodePolyline(route.polyline)
    : null;

  // Show loading state while fetching plan for edit
  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="text-muted-foreground mt-4">Loading plan...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Form with ScrollView */}
      <ScrollView className="flex-1 p-4">
        <View className="gap-4 pb-6">
          {/* Row 1: Activity Category Icon + Name Input */}
          <View className="flex-row gap-3">
            <ActivityCategorySelector
              value={activityCategory}
              onChange={(category) =>
                setActivityCategory(
                  category as "run" | "bike" | "swim" | "strength" | "other",
                )
              }
              compact
            />

            <Input
              value={name}
              onChangeText={setName}
              placeholder="Activity name"
              className="flex-1 h-[48px]"
            />
          </View>

          {/* Row 1.5: Activity Location */}
          <View>
            <ActivityLocationSelector
              value={activityLocation}
              onChange={(location) =>
                setActivityLocation(location as "outdoor" | "indoor")
              }
            />
          </View>

          {/* Row 2: Description */}
          <Textarea
            value={description}
            onChangeText={setDescription}
            placeholder="Description (optional)"
            className="min-h-[60px] max-h-[80px]"
            multiline
            numberOfLines={2}
            scrollEnabled={true}
          />

          {/* Route Upload - Simple Button */}
          <Card>
            <CardContent className="p-4">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-semibold">Route (Optional)</Text>
                {routeId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={handleRemoveRoute}
                    disabled={isUploadingRoute}
                  >
                    <Icon as={X} size={16} className="text-muted-foreground" />
                  </Button>
                )}
              </View>

              {!routeId ? (
                <Button
                  variant="outline"
                  onPress={handlePickGpxFile}
                  disabled={isUploadingRoute}
                  className="w-full flex-row items-center justify-center gap-2"
                >
                  <Icon as={Upload} size={18} className="text-foreground" />
                  <Text className="text-foreground">
                    {isUploadingRoute ? "Uploading..." : "Upload GPX File"}
                  </Text>
                </Button>
              ) : route && routeCoordinates ? (
                <View className="border border-border rounded-lg overflow-hidden">
                  {/* Map Preview */}
                  <View className="h-32 bg-muted">
                    <MapView
                      style={{ flex: 1 }}
                      provider={PROVIDER_DEFAULT}
                      scrollEnabled={false}
                      zoomEnabled={false}
                      pitchEnabled={false}
                      rotateEnabled={false}
                      initialRegion={{
                        latitude:
                          routeCoordinates[
                            Math.floor(routeCoordinates.length / 2)
                          ].latitude,
                        longitude:
                          routeCoordinates[
                            Math.floor(routeCoordinates.length / 2)
                          ].longitude,
                        latitudeDelta: 0.05,
                        longitudeDelta: 0.05,
                      }}
                    >
                      <Polyline
                        coordinates={routeCoordinates}
                        strokeColor="#3b82f6"
                        strokeWidth={3}
                        lineCap="round"
                        lineJoin="round"
                      />
                    </MapView>
                  </View>

                  {/* Route Stats */}
                  <View className="p-3 bg-card">
                    <Text className="font-medium mb-1">{route.name}</Text>
                    <View className="flex-row gap-3">
                      <View className="flex-row items-center gap-1">
                        <Icon
                          as={MapPin}
                          size={14}
                          className="text-muted-foreground"
                        />
                        <Text className="text-xs text-muted-foreground">
                          {(route.total_distance / 1000).toFixed(1)} km
                        </Text>
                      </View>
                      {route.total_ascent != null && route.total_ascent > 0 && (
                        <Text className="text-xs text-muted-foreground">
                          ↑ {route.total_ascent}m
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              ) : null}
            </CardContent>
          </Card>

          {/* Combined Structure + Metrics Card */}
          <Card>
            <CardContent className="p-4 flex-1">
              <Pressable onPress={handleEditStructure} className="flex-1">
                {/* Metrics Row - Minimal and elegant */}
                <View className="flex-row items-center gap-4 mb-3">
                  <View className="flex-row items-center gap-1">
                    <Text className="text-xs text-muted-foreground">
                      Duration:
                    </Text>
                    <Text className="text-sm font-medium">
                      {formatDuration(metrics.duration) || "0min"}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Text className="text-xs text-muted-foreground">TSS:</Text>
                    <Text className="text-sm font-medium">
                      {Math.round(additionalMetrics.tss) || 0}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Text className="text-xs text-muted-foreground">IF:</Text>
                    <Text className="text-sm font-medium">
                      {additionalMetrics.if.toFixed(2)}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Text className="text-xs text-muted-foreground">
                      Steps:
                    </Text>
                    <Text className="text-sm font-medium">
                      {metrics.stepCount}
                    </Text>
                  </View>
                </View>

                {/* Structure Preview */}
                {intervals.length === 0 ? (
                  <View className="flex-1 items-center justify-center py-12">
                    <Text className="text-base text-muted-foreground mb-2">
                      No structure defined
                    </Text>
                    <Text className="text-sm text-muted-foreground text-center mb-4">
                      Tap to add steps and intervals
                    </Text>
                    <View className="bg-muted rounded-lg px-6 py-3">
                      <Text className="text-sm font-medium">
                        + Add Structure
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View className="flex-1">
                    <TimelineChart
                      structure={storeStructure}
                      height={120}
                      onStepPress={handleEditStructure}
                    />
                    <View className="mt-3 p-2 bg-muted/50 rounded-lg">
                      <Text className="text-xs text-muted-foreground text-center">
                        Tap to edit structure
                      </Text>
                    </View>
                  </View>
                )}
              </Pressable>
            </CardContent>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}
