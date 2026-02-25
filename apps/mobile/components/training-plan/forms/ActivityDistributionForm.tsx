import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { publicActivityCategorySchema } from "@repo/supabase";
import React, { useState, useEffect } from "react";
import { View } from "react-native";

type PublicActivityCategory = "run" | "bike" | "swim" | "strength" | "other";

interface ActivityDistributionFormProps {
  data: Record<PublicActivityCategory, number> | null;
  onChange: (distribution: Record<PublicActivityCategory, number>) => void;
  errors: Record<string, string>;
}

const ACTIVITY_LABELS: Record<PublicActivityCategory, string> = {
  run: "Running",
  bike: "Cycling",
  swim: "Swimming",
  strength: "Strength Training",
  other: "Other Activities",
};

const ACTIVITY_EMOJIS: Record<PublicActivityCategory, string> = {
  run: "🏃",
  bike: "🚴",
  swim: "🏊",
  strength: "💪",
  other: "🎯",
};

export function ActivityDistributionForm({
  data,
  onChange,
  errors,
}: ActivityDistributionFormProps) {
  const [isMultiSport, setIsMultiSport] = useState(false);
  const [primaryActivity, setPrimaryActivity] =
    useState<PublicActivityCategory>("run");
  const [distribution, setDistribution] = useState<
    Record<PublicActivityCategory, number>
  >({
    run: 0,
    bike: 0,
    swim: 0,
    strength: 0,
    other: 0,
  });

  // Initialize from data prop
  useEffect(() => {
    if (data) {
      const categories = Object.keys(data) as PublicActivityCategory[];
      if (categories.length === 1 && data[categories[0]] === 1) {
        // Single-sport mode
        setIsMultiSport(false);
        setPrimaryActivity(categories[0]!);
      } else {
        // Multi-sport mode
        setIsMultiSport(true);
        setDistribution(data);
      }
    } else {
      // Default: single-sport run
      onChange({ run: 1.0, bike: 0, swim: 0, strength: 0, other: 0 });
    }
  }, []);

  // Handle multi-sport toggle
  const handleMultiSportToggle = (enabled: boolean) => {
    setIsMultiSport(enabled);
    if (!enabled) {
      // Switch to single-sport mode
      const newDist = { [primaryActivity]: 1.0 } as Record<
        PublicActivityCategory,
        number
      >;
      onChange(newDist);
    } else {
      // Switch to multi-sport mode with balanced distribution
      const balanced: Record<PublicActivityCategory, number> = {
        run: 0.4,
        bike: 0.3,
        swim: 0.15,
        strength: 0.1,
        other: 0.05,
      };
      setDistribution(balanced);
      onChange(balanced);
    }
  };

  // Handle primary activity selection (single-sport)
  const handlePrimaryActivityChange = (activity: PublicActivityCategory) => {
    setPrimaryActivity(activity);
    const newDist = { [activity]: 1.0 } as Record<
      PublicActivityCategory,
      number
    >;
    onChange(newDist);
  };

  // Handle slider change (multi-sport)
  const handleSliderChange = (
    category: PublicActivityCategory,
    value: number,
  ) => {
    const newDist = {
      ...distribution,
      [category]: value,
    };
    setDistribution(newDist);
    onChange(newDist);
  };

  // Calculate sum for validation
  const sum =
    distribution.run +
    distribution.bike +
    distribution.swim +
    distribution.strength +
    distribution.other;
  const sumPercent = Math.round(sum * 100);
  const isValid = Math.abs(sum - 1.0) < 0.01;

  return (
    <View className="gap-6">
      {/* Header */}
      <View className="gap-2">
        <Text className="text-2xl font-bold">Activity Distribution</Text>
        <Text className="text-muted-foreground">
          Define how your training time is split across different activity types
        </Text>
      </View>

      {/* Multi-Sport Toggle */}
      <Card>
        <CardContent className="p-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-4">
              <Text className="font-semibold mb-1">Multi-Sport Training</Text>
              <Text className="text-sm text-muted-foreground">
                {isMultiSport
                  ? "Customize percentages for each activity type"
                  : "Focus on a single primary activity"}
              </Text>
            </View>
            <Switch
              checked={isMultiSport}
              onCheckedChange={handleMultiSportToggle}
            />
          </View>
        </CardContent>
      </Card>

      {/* Single-Sport Mode: Primary Activity Selector */}
      {!isMultiSport && (
        <View className="gap-3">
          <Label className="text-base font-semibold">Primary Activity</Label>
          <View className="gap-2">
            {(Object.keys(ACTIVITY_LABELS) as PublicActivityCategory[]).map(
              (activity) => (
                <Button
                  key={activity}
                  variant={primaryActivity === activity ? "default" : "outline"}
                  onPress={() => handlePrimaryActivityChange(activity)}
                  className="justify-start"
                >
                  <View className="flex-row items-center gap-2">
                    <Text
                      className={
                        primaryActivity === activity
                          ? "text-primary-foreground"
                          : "text-foreground"
                      }
                    >
                      {ACTIVITY_EMOJIS[activity]} {ACTIVITY_LABELS[activity]}
                    </Text>
                  </View>
                </Button>
              ),
            )}
          </View>
        </View>
      )}

      {/* Multi-Sport Mode: Percentage Sliders */}
      {isMultiSport && (
        <>
          <View className="gap-4">
            {(Object.keys(ACTIVITY_LABELS) as PublicActivityCategory[]).map(
              (activity) => (
                <View key={activity} className="gap-2">
                  <View className="flex-row justify-between items-center">
                    <Label className="text-sm font-medium">
                      {ACTIVITY_EMOJIS[activity]} {ACTIVITY_LABELS[activity]}
                    </Label>
                    <Text className="text-sm font-semibold text-primary">
                      {Math.round(distribution[activity] * 100)}%
                    </Text>
                  </View>
                  <Slider
                    value={distribution[activity]}
                    onValueChange={(value: number) =>
                      handleSliderChange(activity, value)
                    }
                    minimumValue={0}
                    maximumValue={1}
                    step={0.05}
                    minimumTrackTintColor="#3b82f6"
                    maximumTrackTintColor="#e5e7eb"
                  />
                </View>
              ),
            )}
          </View>

          {/* Sum Validation */}
          <Card
            className={
              isValid
                ? "bg-success/10 border-success"
                : "bg-destructive/10 border-destructive"
            }
          >
            <CardContent className="p-4">
              <View className="flex-row items-center justify-between">
                <Text
                  className={
                    isValid
                      ? "text-success font-semibold"
                      : "text-destructive font-semibold"
                  }
                >
                  Total: {sumPercent}%
                </Text>
                {isValid ? (
                  <Text className="text-success text-sm">✓ Valid</Text>
                ) : (
                  <Text className="text-destructive text-sm">
                    Must equal 100%
                  </Text>
                )}
              </View>
            </CardContent>
          </Card>

          {errors.activity_distribution && (
            <Text className="text-destructive text-sm">
              {errors.activity_distribution}
            </Text>
          )}
        </>
      )}

      {/* Info Card */}
      <Card className="bg-muted/50">
        <CardContent className="p-4 gap-2">
          <Text className="font-semibold mb-1">
            💡 Activity Distribution Tips
          </Text>
          {isMultiSport ? (
            <>
              <Text className="text-sm text-muted-foreground">
                • Percentages represent how you split your weekly training time
              </Text>
              <Text className="text-sm text-muted-foreground">
                • For triathlons, common splits are 40% run, 40% bike, 20% swim
              </Text>
              <Text className="text-sm text-muted-foreground">
                • Include strength training (5-15%) for injury prevention
              </Text>
            </>
          ) : (
            <>
              <Text className="text-sm text-muted-foreground">
                • Single-sport mode dedicates 100% of training to one activity
              </Text>
              <Text className="text-sm text-muted-foreground">
                • Switch to multi-sport if you&apos;re training for multiple
                disciplines
              </Text>
              <Text className="text-sm text-muted-foreground">
                • You can always change this later in plan settings
              </Text>
            </>
          )}
        </CardContent>
      </Card>
    </View>
  );
}
