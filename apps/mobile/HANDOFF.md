# 🚀 Record Launcher Flow - Implementation Handoff

## Overview

This document outlines the refactoring of the GradientPeak mobile app's activity recording system to implement a modern, tab-based launcher flow with smart routing and enhanced user experience.

---

## 📊 Current State Analysis

### Existing Implementation
- **Navigation**: Currently using direct push to `/record` from `record-launcher.tsx`
- **Activity Types**: Defined in `@repo/supabase/supazod/schemas.ts` and exported through the `@repo/core` as `PublicActivityType`
- **Recording Service**: `ActivityRecorderService` with plan support via `selectPlan()` method
- **Activity Selection**: Using `selectUnplannedActivity()` for quick start activities
- **Plan Structure**: Already defined in `@repo/core/schemas/activity_plan_structure.ts`
- **Provider**: `ActivityRecorderProvider` maintains service instance across components
- **UI Components**: Full suite of styled components in `/components/ui/`

### Activity Types (from Supabase)
```typescript
PublicActivityType =
  | "outdoor_run"
  | "outdoor_bike"
  | "indoor_treadmill"
  | "indoor_bike_trainer"
  | "indoor_strength"
  | "indoor_swim"
  | "other"
```

### Existing UI Components to Leverage
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` - Tab navigation
- `Card`, `CardHeader`, `CardContent` - Activity cards
- `Button` - Action buttons with variants
- `Icon` - Lucide icon wrapper with styling
- `Text` - Typography with consistent styles
- `DropdownMenu` - Menu actions for cards
- `ActivityGraph` - Mini activity graphs (from `/components/ActivityPlan/`)
- Native `FlatList` and `ScrollView` - List rendering

### Current Navigation Flow
1. Tab press → `record-launcher.tsx` → Immediate redirect to `/record`
2. Record screen shows activity selection within recording flow
3. No separation between selection and recording phases

---

## 🎯 Architecture Goals

1. **Separation of Concerns**: Clear distinction between activity selection and recording phases
2. **Type Safety**: Centralized types in `@gradientpeak/core` package
3. **Smart Routing**: Automatic navigation based on activity type and plan availability
4. **Enhanced UX**: Tab-based organization with rich activity previews
5. **Reusability**: Modular components that can be shared across the platform

---

## 📁 File Structure

### Required New Files
```
gradientpeak/
├── packages/
│   └── core/
│       ├── types/
│       │   └── activity.ts          # NEW: Core activity types and validation
│       └── utils/
│           ├── targets.ts           # NEW: Target conversion utilities
│           └── metrics.ts           # NEW: Metrics calculation utilities
│
└── apps/mobile/
    └── src/
        ├── app/(internal)/
        │   ├── (tabs)/
        │   │   └── record-launcher.tsx  # UPDATE: Add tabs instead of redirect
        │   └── follow-along/            # NEW: Step-based activity screen
        │       └── index.tsx
        └── components/
            └── record/
                ├── ActivityCard.tsx      # NEW: Dual-tap card
                ├── QuickStartList.tsx    # NEW: Quick start activities
                ├── PlannedActivitiesList.tsx # NEW: Planned activities
                └── TemplatesList.tsx     # NEW: Template browser
```

### Existing Files to Update
- `apps/mobile/src/app/(internal)/record/index.tsx` - Parse ActivityPayload from params
- `apps/mobile/src/lib/services/ActivityRecorder/index.ts` - Add payload handler method
- `packages/core/schemas/index.ts` - Export new schemas if needed

---

## 🔧 Core Components

### 1. Core Types (`@gradientpeak/core/types/activity.ts`)

```typescript
import { z } from "zod";
import { publicActivityTypeSchema } from "@repo/supabase/supazod/schemas";
import { activityPlanStructureSchema } from "../schemas/activity_plan_structure";

// Re-export the activity type from Supabase
export const ActivityType = publicActivityTypeSchema;
export type ActivityType = z.infer<typeof ActivityType>;

// Define ActivityPayload without intent field
export const ActivityPayloadSchema = z.object({
  type: ActivityType,
  plannedActivityId: z.string().optional(), // Links to planned_activities table
  plan: z.object({
    name: z.string().optional(),
    structure: activityPlanStructureSchema.optional(),
  }).nullable(),
});

export type ActivityPayload = z.infer<typeof ActivityPayloadSchema>;

// Helper functions using actual activity types from Supabase
export const isContinuousActivity = (type: ActivityType): boolean => {
  return ['outdoor_run', 'outdoor_bike', 'indoor_bike_trainer', 'indoor_treadmill'].includes(type);
};

export const isStepBasedActivity = (type: ActivityType): boolean => {
  return ['indoor_strength', 'indoor_swim'].includes(type);
};

export const isOutdoorActivity = (type: ActivityType): boolean => {
  return ['outdoor_run', 'outdoor_bike'].includes(type);
};
```

### Available Sample Workouts

The core package (`@gradientpeak/core/samples`) provides 36 comprehensive workout plans across all activity types:

#### Import Methods
```typescript
// Import all samples
import { SAMPLE_ACTIVITIES } from "@gradientpeak/core/samples";

// Import by activity type
import { 
  SAMPLE_OUTDOOR_RUN_ACTIVITIES,
  SAMPLE_OUTDOOR_BIKE_ACTIVITIES,
  SAMPLE_INDOOR_TRAINER_ACTIVITIES,
  SAMPLE_TREADMILL_ACTIVITIES,
  SAMPLE_INDOOR_STRENGTH_ACTIVITIES,
  SAMPLE_INDOOR_SWIM_ACTIVITIES,
  SAMPLE_OTHER_ACTIVITIES
} from "@gradientpeak/core/samples";

// Get activities by type dynamically
import { getSampleActivitiesByType } from "@gradientpeak/core/samples";
const runWorkouts = getSampleActivitiesByType('outdoor_run');
```

#### Available Workouts by Type:
- **🚴 Indoor Bike Trainer** (6 workouts): Sweet Spot, VO2 Max, Recovery, Sprint, Threshold HR, Test Workout
- **🏃 Indoor Treadmill** (5 workouts): Threshold runs, Speed intervals, Recovery, Hill intervals
- **🏃‍♂️ Outdoor Run** (5 workouts): Easy aerobic, Tempo, Intervals, Long run, Fartlek
- **🚵 Outdoor Bike** (5 workouts): Endurance, Sweet spot, Tempo, Climbing, Group ride
- **💪 Indoor Strength** (5 workouts): Upper body, Lower body, Full body circuit, Core, Functional
- **🏊 Indoor Swim** (5 workouts): Easy swim, Sprint intervals, Threshold, Technique, Endurance
- **🎯 Other Activities** (5 workouts): Yoga, Rock climbing, Hiking, CrossFit, Recovery walk

Each workout includes:
- Complete step-by-step structure with durations
- Target intensities (%FTP for cycling, %ThresholdHR for running/general)
- Detailed notes and guidance for each step
- Estimated TSS and total duration
- Support for repetition blocks and nested structures

### 2. Updated Record Launcher (`record-launcher.tsx`)

**Build tabs directly in the page using existing UI components:**

```typescript
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { QuickStartList } from "@/components/record/QuickStartList";
import { PlannedActivitiesList } from "@/components/record/PlannedActivitiesList";
import { TemplatesList } from "@/components/record/TemplatesList";
import { isContinuousActivity, type ActivityPayload } from "@repo/core/types/activity";
import { useRouter } from "expo-router";
import { View, Alert, Share } from "react-native";
import { useState } from "react";

export default function RecordLauncher() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("quick-start");

  const handleActivitySelected = (payload: ActivityPayload) => {
    // Smart routing based on activity type and plan
    const isContinuous = isContinuousActivity(payload.type);
    const hasStructure = !!payload.plan?.structure;

    // Serialize payload for URL params
    const params = { payload: JSON.stringify(payload) };

    if (!hasStructure || isContinuous) {
      // Quick start or continuous structured → Record screen
      router.push({
        pathname: "/record",
        params
      });
    } else {
      // Step-based structured → Follow-along screen
      router.push({
        pathname: "/follow-along",
        params
      });
    }
  };

  const handleMenuPress = (activity: any) => {
    Alert.alert(
      "Options",
      "Choose an action",
      [
        {
          text: "Generate PDF",
          onPress: () => console.log("Generate PDF", activity),
        },
        {
          text: "Share",
          onPress: () => {
            Share.share({
              title: activity.title || "Activity Plan",
              message: `Check out my workout plan: ${activity.title || activity.type}`,
            });
          },
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1 }} className="bg-background">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
        <TabsList className="px-4">
          <TabsTrigger value="quick-start">Quick Start</TabsTrigger>
          <TabsTrigger value="planned">Planned</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="quick-start" className="flex-1">
          <QuickStartList
            onSelect={(type) => {
              const payload: ActivityPayload = { type, plan: null };
              handleActivitySelected(payload);
            }}
          />
        </TabsContent>

        <TabsContent value="planned" className="flex-1">
          <PlannedActivitiesList
            onSelect={(activity) => {
              const payload: ActivityPayload = {
                type: activity.type,
                plannedActivityId: activity.id,
                plan: activity.plan
              };
              handleActivitySelected(payload);
            }}
            onMenuPress={handleMenuPress}
          />
        </TabsContent>

        <TabsContent value="templates" className="flex-1">
          <TemplatesList
            onTemplateSelect={(template) => {
              const payload: ActivityPayload = {
                type: template.type,
                plan: template.plan
              };
              handleActivitySelected(payload);
            }}
            onTemplateMenuPress={handleMenuPress}
          />
        </TabsContent>
      </Tabs>
    </View>
  );
}
```

### 3. Activity Card Component (`ActivityCard.tsx`)

```typescript
import { PublicActivityType } from "@repo/supabase";
import React from "react";
import { TouchableOpacity, View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { MoreVertical } from "lucide-react-native";
import { ACTIVITY_ICONS } from "@/lib/services/ActivityRecorder/types";
import { ActivityGraph } from "@/components/ActivityPlan/ActivityGraph";

interface ActivityCardProps {
  activity: {
    id?: string;
    type: PublicActivityType;
    plannedActivityId?: string;
    plan?: {
      name?: string;
      structure?: any;
    };
    title?: string;
    duration?: number;
    distance?: number;
    tss?: number;
  };
  onCardPress: () => void;
  onMenuPress?: () => void;
}

export function ActivityCard({ activity, onCardPress, onMenuPress }: ActivityCardProps) {
  const IconComponent = ACTIVITY_ICONS[activity.type];
  const displayName = activity.title || activity.plan?.name ||
    activity.type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

  return (
    <TouchableOpacity onPress={onCardPress} activeOpacity={0.7}>
      <Card className="mb-3">
        <CardContent className="p-0">
          <View className="flex-row justify-between p-4">
            <View className="flex-row items-center flex-1">
              <View className="bg-primary/10 p-3 rounded-lg mr-3">
                <Icon as={IconComponent} size={24} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="text-lg font-medium">{displayName}</Text>
                <View className="flex-row gap-3 mt-1">
                  {activity.duration && (
                    <Text className="text-sm text-muted-foreground">
                      {Math.round(activity.duration / 60)} min
                    </Text>
                  )}
                  {activity.distance && (
                    <Text className="text-sm text-muted-foreground">
                      {activity.distance.toFixed(1)} km
                    </Text>
                  )}
                  {activity.tss && (
                    <Text className="text-sm text-muted-foreground">
                      TSS {activity.tss}
                    </Text>
                  )}
                </View>
              </View>
            </View>

            {onMenuPress && (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onMenuPress();
                }}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                className="p-2"
              >
                <Icon as={MoreVertical} size={20} className="text-muted-foreground" />
              </TouchableOpacity>
            )}
          </View>

          {/* Mini activity graph using existing component */}
          {activity.plan?.structure && (
            <View className="h-16 px-4 pb-3">
              <ActivityGraph structure={activity.plan.structure} compact />
            </View>
          )}
        </CardContent>
      </Card>
    </TouchableOpacity>
  );
}
```

### 4. Quick Start List Component (`QuickStartList.tsx`)

```typescript
import { FlatList, TouchableOpacity, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { PublicActivityType } from "@repo/supabase";
import { ACTIVITY_ICONS, ACTIVITY_NAMES } from "@/lib/services/ActivityRecorder/types";
import { isContinuousActivity } from "@repo/core/types/activity";

interface QuickStartListProps {
  onSelect: (type: PublicActivityType) => void;
}

const QUICK_START_ACTIVITIES: PublicActivityType[] = [
  "outdoor_run",
  "outdoor_bike",
  "indoor_treadmill",
  "indoor_bike_trainer"
].filter(isContinuousActivity);

export function QuickStartList({ onSelect }: QuickStartListProps) {
  return (
    <FlatList
      data={QUICK_START_ACTIVITIES}
      contentContainerStyle={{ padding: 16 }}
      ItemSeparatorComponent={() => <View className="h-2" />}
      renderItem={({ item }) => {
        const IconComponent = ACTIVITY_ICONS[item];
        const name = ACTIVITY_NAMES[item];

        return (
          <Button
            variant="outline"
            onPress={() => onSelect(item)}
            className="flex-row justify-start h-auto p-4"
          >
            <Icon as={IconComponent} size={24} className="mr-3" />
            <Text className="text-lg">{name}</Text>
          </Button>
        );
      }}
      keyExtractor={(item) => item}
    />
  );
}
```

### 5. Templates List Component (`TemplatesList.tsx`)

```typescript
import React, { useState } from 'react';
import { View, TouchableOpacity, FlatList, ScrollView } from 'react-native';
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityCard } from './ActivityCard';
import { ChevronLeft, Footprints, Bike, Dumbbell, Waves, Activity } from 'lucide-react-native';
import { PublicActivityType } from '@repo/supabase';
import { 
  getSampleActivitiesByType,
  SAMPLE_ACTIVITIES_BY_TYPE 
} from '@gradientpeak/core/samples';

const CATEGORIES = [
  { id: 'outdoor_run', name: 'Outdoor Running', icon: Footprints },
  { id: 'outdoor_bike', name: 'Outdoor Cycling', icon: Bike },
  { id: 'indoor_treadmill', name: 'Treadmill Workouts', icon: Footprints },
  { id: 'indoor_bike_trainer', name: 'Indoor Bike Trainer', icon: Bike },
  { id: 'indoor_strength', name: 'Strength Training', icon: Dumbbell },
  { id: 'indoor_swim', name: 'Swimming', icon: Waves },
  { id: 'other', name: 'Other Activities', icon: Activity },
];

const getTemplatesByCategory = (category: string) => {
  // Get real sample activities from core package
  const activities = getSampleActivitiesByType(category as keyof typeof SAMPLE_ACTIVITIES_BY_TYPE);
  
  // Transform to match expected format
  return activities.map((activity, index) => ({
    id: `${category}-${index}`,
    type: activity.activity_type as PublicActivityType,
    title: activity.name,
    duration: activity.estimated_duration || 3600,
    plan: {
      name: activity.name,
      description: activity.description,
      structure: activity.structure,
      estimated_tss: activity.estimated_tss
    }
  }));
};

interface TemplatesListProps {
  onTemplateSelect: (template: any) => void;
  onTemplateMenuPress: (template: any) => void;
}

export function TemplatesList({ onTemplateSelect, onTemplateMenuPress }: TemplatesListProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  
  React.useEffect(() => {
    if (selectedCategory) {
      const categoryTemplates = getTemplatesByCategory(selectedCategory);
      setTemplates(categoryTemplates);
    }
  }, [selectedCategory]);
  
  if (!selectedCategory) {
    // Show categories grid
    return (
      <ScrollView className="flex-1 p-4">
        <Text variant="h3" className="mb-4">Activity Categories</Text>
        <View className="flex-row flex-wrap justify-between">
          {CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category.id}
              onPress={() => setSelectedCategory(category.id)}
              className="w-[48%] mb-4"
            >
              <Card>
                <CardContent className="items-center py-6">
                  <Icon as={category.icon} size={32} className="text-primary mb-2" />
                  <Text className="text-center">{category.name}</Text>
                </CardContent>
              </Card>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    );
  }
  
  // Show templates for selected category
  return (
    <View className="flex-1">
      <View className="px-4 pt-4 pb-2">
        <Button
          variant="ghost"
          onPress={() => setSelectedCategory(null)}
          className="flex-row justify-start -ml-2"
        >
          <Icon as={ChevronLeft} size={20} className="mr-1" />
          <Text>Back to Categories</Text>
        </Button>
        
        <Text variant="h3" className="mt-2">
          {CATEGORIES.find(c => c.id === selectedCategory)?.name}
        </Text>
      </View>
      
      <FlatList
        data={templates}
        contentContainerStyle={{ padding: 16 }}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <ActivityCard
            activity={item}
            onCardPress={() => onTemplateSelect(item)}
            onMenuPress={() => onTemplateMenuPress(item)}
          />
        )}
      />
    </View>
  );
}
```

### 6. Planned Activities List Component (`PlannedActivitiesList.tsx`)

```typescript
import React from 'react';
import { FlatList, View, ActivityIndicator } from 'react-native';
import { Text } from "@/components/ui/text";
import { ActivityCard } from './ActivityCard';
import { useQuery } from '@tanstack/react-query';

import { 
  SAMPLE_ACTIVITIES 
} from '@gradientpeak/core/samples';

interface PlannedActivitiesListProps {
  onActivitySelect: (activity: any) => void;
  onActivityMenuPress: (activity: any) => void;
}

export function PlannedActivitiesList({ onActivitySelect, onActivityMenuPress }: PlannedActivitiesListProps) {
  // TODO: Replace with actual API call
  const { data: activities, isLoading } = useQuery({
    queryKey: ['planned-activities'],
    queryFn: async () => {
      // Use sample activities from core package - replace with actual API call
      const sampleActivities = SAMPLE_ACTIVITIES.slice(0, 3); // Get first 3 samples
      
      return sampleActivities.map((activity, index) => ({
        id: `planned-${index}`,
        type: activity.activity_type,
        title: activity.name,
        plannedDate: new Date(),
        duration: activity.estimated_duration || 3600,
        tss: activity.estimated_tss,
        plan: {
          name: activity.name,
          description: activity.description,
          structure: activity.structure,
          estimated_tss: activity.estimated_tss
        }
      }));
    }
  });

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <View className="flex-1 justify-center items-center p-8">
        <Text className="text-center text-muted-foreground">
          No planned activities for today
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={activities}
      contentContainerStyle={{ padding: 16 }}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <ActivityCard
          activity={item}
          onCardPress={() => onActivitySelect(item)}
          onMenuPress={() => onActivityMenuPress(item)}
        />
      )}
    />
  );
}
```

### 7. Updated Record Screen Handler

```typescript
// apps/mobile/src/app/(internal)/record/index.tsx
import { ActivityPayload } from "@repo/core/types/activity";
import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";

export default function RecordModal() {
  const params = useLocalSearchParams();
  const service = useSharedActivityRecorder();
  
  // Parse payload from navigation params
  useEffect(() => {
    if (params.payload) {
      try {
        const payload: ActivityPayload = JSON.parse(params.payload as string);
        
        // Set activity type
        service?.selectUnplannedActivity(payload.type);
        
        // Set plan if available
        if (payload.plan?.structure && payload.plannedActivityId) {
          service?.selectPlan(
            {
              name: payload.plan.name || `${payload.type} workout`,
              activity_type: payload.type,
              structure: payload.plan.structure,
              // ... other plan fields
            },
            payload.plannedActivityId
          );
        }
      } catch (error) {
        console.error("Failed to parse activity payload:", error);
      }
    }
  }, [params.payload, service]);
  
  // ... rest of component
}
```

### 8. Service Enhancement

```typescript
// apps/mobile/src/lib/services/ActivityRecorder/index.ts
// Add new method to handle ActivityPayload

selectActivityFromPayload(payload: ActivityPayload): void {
  console.log("[Service] Selecting activity from payload:", payload);
  
  // Set activity type
  this.selectedActivityType = payload.type;
  
  // Handle plan if present
  if (payload.plan?.structure) {
    const plan: RecordingServiceActivityPlan = {
      name: payload.plan.name || `${payload.type} workout`,
      activity_type: payload.type,
      structure: payload.plan.structure,
      // Map other fields as needed
    };
    
    this.selectPlan(plan, payload.plannedActivityId);
  } else {
    this.clearPlan();
  }
  
  this.emit("activitySelected", payload.type);
}
```

### 9. Follow-Along Screen (`/follow-along/index.tsx`)

**Simple horizontal carousel for step-based activities with activity graph footer:**

```typescript
import React, { useState, useRef } from 'react';
import { View, ScrollView, Dimensions, TouchableOpacity } from 'react-native';
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { X, Clock, Target, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ActivityPayload } from "@repo/core/types/activity";
import { 
  flattenPlanSteps, 
  formatTargetRange, 
  getMetricDisplayName,
  type FlattenedStep 
} from "@repo/core/schemas/activity_plan_structure";

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 48; // Account for padding

interface StepCardProps {
  step: FlattenedStep;
  index: number;
  isActive: boolean;
}

function StepCard({ step, index, isActive }: StepCardProps) {
  const formatDuration = (duration: any) => {
    if (duration === "untilFinished") return "Until finished";
    if (!duration) return "No duration";
    
    const { value, unit } = duration;
    return `${value} ${unit}`;
  };

  return (
    <Card className={`mx-2 ${isActive ? 'border-primary' : ''}`} style={{ width: CARD_WIDTH }}>
      <CardContent className="p-6">
        {/* Step Header */}
        <View className="mb-4">
          <Text className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            Step {index + 1}
          </Text>
          <Text className="text-2xl font-bold">{step.name || `Step ${index + 1}`}</Text>
        </View>

        {/* Duration */}
        <View className="flex-row items-center mb-4">
          <Icon as={Clock} size={20} className="text-muted-foreground mr-2" />
          <Text className="text-lg">{formatDuration(step.duration)}</Text>
        </View>

        {/* Targets */}
        {step.targets && step.targets.length > 0 && (
          <View className="mb-4">
            <Text className="text-sm font-semibold text-muted-foreground mb-2">TARGETS</Text>
            <View className="bg-muted/20 rounded-lg p-3 gap-2">
              {step.targets.map((target, idx) => (
                <View key={idx} className="flex-row items-center justify-between">
                  <Text className="text-sm font-medium">
                    {getMetricDisplayName(target.type)}
                  </Text>
                  <Text className="text-sm font-bold text-primary">
                    {formatTargetRange(target)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Description */}
        {step.description && (
          <View className="mb-4">
            <Text className="text-sm text-muted-foreground">{step.description}</Text>
          </View>
        )}

        {/* Notes */}
        {step.notes && (
          <View className="bg-blue-500/10 rounded-lg p-3">
            <Text className="text-xs italic text-blue-600 dark:text-blue-400">
              💡 {step.notes}
            </Text>
          </View>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityGraph({ steps, currentIndex }: { steps: FlattenedStep[], currentIndex: number }) {
  // Calculate total duration for width proportions
  const totalDuration = steps.reduce((sum, step) => {
    if (step.duration === "untilFinished" || !step.duration) return sum + 300; // Default 5 min
    return sum + (step.duration.value || 0);
  }, 0);

  return (
    <View className="px-4 pb-4">
      <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Workout Progress
      </Text>
      <View className="bg-muted/20 rounded-lg border border-muted/20 p-3">
        <View className="flex-row items-end" style={{ height: 60 }}>
          {steps.map((step, index) => {
            const duration = step.duration === "untilFinished" || !step.duration 
              ? 300 
              : step.duration.value || 0;
            const width = Math.max(8, (duration / totalDuration) * 100);
            const maxIntensity = step.targets?.[0]?.intensity || 50;
            const height = Math.max(20, Math.min(100, (maxIntensity / 100) * 100));
            const isActive = index === currentIndex;
            
            return (
              <View
                key={index}
                style={{
                  width: `${width}%`,
                  height: `${height}%`,
                  backgroundColor: isActive ? '#3b82f6' : '#94a3b8',
                  opacity: isActive ? 1 : 0.3,
                }}
                className="rounded-sm mx-[1px]"
              />
            );
          })}
        </View>
        <View className="flex-row justify-between mt-2">
          <Text className="text-xs text-muted-foreground">Start</Text>
          <Text className="text-xs font-semibold">
            {currentIndex + 1} / {steps.length} steps
          </Text>
          <Text className="text-xs text-muted-foreground">Finish</Text>
        </View>
      </View>
    </View>
  );
}

export default function FollowAlongScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Parse activity payload
  const payload: ActivityPayload = params.payload 
    ? JSON.parse(params.payload as string) 
    : null;
  
  if (!payload?.plan?.structure) {
    return (
      <View className="flex-1 justify-center items-center p-8">
        <Text className="text-center text-muted-foreground">
          No workout plan available
        </Text>
        <Button 
          onPress={() => router.back()} 
          className="mt-4"
        >
          Go Back
        </Button>
      </View>
    );
  }

  // Flatten the workout steps
  const steps = flattenPlanSteps(payload.plan.structure.steps);

  const handleScroll = (event: any) => {
    const contentOffset = event.nativeEvent.contentOffset;
    const index = Math.round(contentOffset.x / (CARD_WIDTH + 16));
    setCurrentIndex(Math.max(0, Math.min(steps.length - 1, index)));
  };

  const scrollToIndex = (index: number) => {
    scrollViewRef.current?.scrollTo({
      x: index * (CARD_WIDTH + 16),
      animated: true
    });
    setCurrentIndex(index);
  };

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center justify-between p-4 border-b border-border">
        <View className="flex-1">
          <Text className="text-lg font-bold">
            {payload.plan.name || 'Workout Steps'}
          </Text>
          <Text className="text-sm text-muted-foreground">
            Swipe to view each step
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.back()}
          className="p-2"
        >
          <Icon as={X} size={24} />
        </TouchableOpacity>
      </View>

      {/* Step Carousel */}
      <View className="flex-1">
        <ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          snapToInterval={CARD_WIDTH + 16}
          decelerationRate="fast"
          contentContainerStyle={{ 
            paddingHorizontal: 8,
            alignItems: 'center'
          }}
          className="flex-1"
        >
          {steps.map((step, index) => (
            <StepCard 
              key={index} 
              step={step} 
              index={index}
              isActive={index === currentIndex}
            />
          ))}
        </ScrollView>

        {/* Navigation Buttons */}
        <View className="flex-row justify-between items-center px-4 py-2">
          <Button
            variant="ghost"
            size="icon"
            onPress={() => scrollToIndex(Math.max(0, currentIndex - 1))}
            disabled={currentIndex === 0}
          >
            <Icon as={ChevronLeft} size={20} />
          </Button>

          <View className="flex-row gap-1">
            {steps.map((_, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => scrollToIndex(index)}
                className={`w-2 h-2 rounded-full ${
                  index === currentIndex ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              />
            ))}
          </View>

          <Button
            variant="ghost"
            size="icon"
            onPress={() => scrollToIndex(Math.min(steps.length - 1, currentIndex + 1))}
            disabled={currentIndex === steps.length - 1}
          >
            <Icon as={ChevronRight} size={20} />
          </Button>
        </View>
      </View>

      {/* Activity Graph Footer */}
      <ActivityGraph steps={steps} currentIndex={currentIndex} />
    </View>
  );
}
```

---

## 🏛️ UI Structure & Navigation

### Tab Structure & Content

| Tab Name | Content | Interaction | Data Source |
| :--- | :--- | :--- | :--- |
| **Quick Start** | Simple list using `Button` variant="outline" | Tap → Launch with `plan: null` | Static list filtered by `isContinuousActivity()` |
| **Planned Activities** | `ActivityCard` components with metrics | Card tap → Launch<br>Menu tap → Utilities | `planned_activities` table via React Query |
| **Templates** | Two-state navigation with `Card` grid | Category tap → Show templates<br>Template tap → Launch | `activity_plans` table filtered by category |

### Component Hierarchy

```
RecordLauncher (Tabs)
├── QuickStartList
│   └── Button (with Icon + Text)
├── PlannedActivitiesList
│   └── ActivityCard
│       ├── Card
│       ├── Icon + Text
│       ├── Metrics
│       └── ActivityGraph (mini)
└── TemplatesList
    ├── Category Grid (Card components)
    └── Template List (ActivityCard components)
```

---

## 🔀 Routing Logic

### Navigation Decision Tree

```mermaid
graph TD
    A[User Taps Activity] --> B{Has Plan?}
    B -->|No| C[Quick Start]
    B -->|Yes| D{Is Continuous?}
    C --> E[/record screen]
    D -->|Yes| E
    D -->|No| F[/follow-along screen]
```

### Payload Examples

These examples show the actual payload structure using real workout plans from `@gradientpeak/core/samples`.

#### Quick Start (No Plan)
```json
{
  "type": "outdoor_run",
  "plannedActivityId": null,
  "plan": null
}
```

#### Template Activity (From Core Samples)
```json
{
  "type": "outdoor_run",
  "plannedActivityId": null,
  "plan": {
    "name": "Tempo Run",
    "description": "Sustained tempo effort with warm-up and cool-down",
    "estimated_tss": 75,
    "structure": {
      "steps": [
        {
          "type": "step",
          "name": "Warm-up Jog",
          "duration": { "type": "time", "value": 900, "unit": "seconds" },
          "targets": [{ "type": "%ThresholdHR", "intensity": 65 }],
          "notes": "Gradually increase pace to prepare for tempo"
        },
        {
          "type": "step",
          "name": "Tempo Block",
          "duration": { "type": "time", "value": 1800, "unit": "seconds" },
          "targets": [{ "type": "%ThresholdHR", "intensity": 85 }],
          "notes": "Steady, controlled effort - should feel comfortably hard"
        },
        {
          "type": "step",
          "name": "Cool-down Jog",
          "duration": { "type": "time", "value": 900, "unit": "seconds" },
          "targets": [{ "type": "%ThresholdHR", "intensity": 65 }],
          "notes": "Relax and gradually bring heart rate down"
        }
      ]
    }
  }
}
```

#### Planned Activity (With Structure)
```json
{
  "type": "indoor_bike_trainer",
  "plannedActivityId": "uuid-123",
  "plan": {
    "name": "Sweet Spot Intervals",
    "description": "60-minute indoor trainer activity focusing on sweet spot power development",
    "estimated_tss": 85,
    "structure": {
      "steps": [
        { 
          "type": "step", 
          "name": "Easy Warm-up", 
          "duration": { "type": "time", "value": 900, "unit": "seconds" },
          "targets": [{ "type": "%FTP", "intensity": 55 }],
          "notes": "Start easy and gradually build intensity"
        },
        {
          "type": "repetition",
          "repeat": 3,
          "steps": [
            {
              "type": "step",
              "name": "Sweet Spot Interval",
              "duration": { "type": "time", "value": 900, "unit": "seconds" },
              "targets": [{ "type": "%FTP", "intensity": 88 }],
              "notes": "Maintain steady power in the sweet spot zone"
            },
            {
              "type": "step",
              "name": "Easy Recovery",
              "duration": { "type": "time", "value": 300, "unit": "seconds" },
              "targets": [{ "type": "%FTP", "intensity": 50 }],
              "notes": "Easy spinning to recover between intervals"
            }
          ]
        },
        {
          "type": "step",
          "name": "Cool-down",
          "duration": { "type": "time", "value": 600, "unit": "seconds" },
          "targets": [{ "type": "%FTP", "intensity": 50 }],
          "notes": "Easy spinning to bring heart rate down"
        }
      ]
    }
  }
}
```

---

## 🎨 UI/UX Patterns

### Component Usage Guidelines

1. **Tabs Component**
   - Use `Tabs` with `value` and `onValueChange` for controlled state
   - `TabsList` with `className="px-4"` for proper padding
   - `TabsContent` with `className="flex-1"` for full height

2. **Cards**
   - Use `Card` component for all activity items in Planned/Templates
   - Add `className="mb-3"` for consistent spacing
   - Wrap in `TouchableOpacity` for entire card tap

3. **Buttons**
   - Use `Button` with `variant="outline"` for Quick Start items
   - Use `variant="ghost"` for back navigation
   - Icon buttons use `hitSlop` for better touch targets

4. **Lists**
   - Use `FlatList` for performance with large datasets
   - Add `contentContainerStyle={{ padding: 16 }}` for consistent padding
   - Use `ItemSeparatorComponent` or margin on items for spacing

5. **Icons**
   - Always use `Icon` component wrapper with Lucide icons
   - Standard sizes: 24 for primary, 20 for secondary, 32 for categories
   - Use `className="text-primary"` for colored icons

### Styling Patterns

```typescript
// Container styles
"flex-1 bg-background"           // Main container
"p-4"                            // Standard padding
"mb-3"                           // Card spacing

// Typography
"text-lg font-medium"            // Card titles
"text-sm text-muted-foreground"  // Secondary text
"text-center"                    // Centered text

// Interactive elements
"bg-primary/10 p-3 rounded-lg"  // Icon containers
"active:opacity-70"              // Touch feedback
"hitSlop={{ top: 10, ... }}"    // Expanded touch area
```

---

## 🔨 Implementation Steps

### Phase 1: Core Infrastructure (2 days)
- [x] Analyze existing types and schemas
- [x] Identify existing UI components to leverage
- [ ] Create `@gradientpeak/core/types/activity.ts`
- [ ] Add helper functions for activity categorization
- [ ] Update `@gradientpeak/core/index.ts` exports

### Phase 2: UI Components (3 days)
- [ ] Update `record-launcher.tsx` with Tabs implementation
- [ ] Create `ActivityCard` using Card, Icon, and Text components
- [ ] Implement `QuickStartList` using Button and FlatList
- [ ] Implement `PlannedActivitiesList` with React Query
- [ ] Implement `TemplatesList` with nested navigation
- [ ] Create `/follow-along/index.tsx` with horizontal carousel

### Phase 3: Navigation Updates (2 days)
- [ ] Update `record-launcher.tsx` to show tabs (no redirect)
- [ ] Add smart routing logic to handle payloads
- [ ] Update `/record/index.tsx` to parse params
- [ ] Create `/follow-along/index.tsx` for step-based activities

### Phase 4: Service Integration (2 days)
- [ ] Add `selectActivityFromPayload()` to ActivityRecorderService
- [ ] Update hooks to handle new navigation flow
- [ ] Ensure plan selection works with plannedActivityId

### Phase 5: API Integration (2 days)
- [ ] Implement planned activities API endpoint
- [ ] Create templates API with category filtering (leverage `@gradientpeak/core/samples` for initial data)
- [ ] Add PDF generation endpoint
- [ ] Replace sample data from `@gradientpeak/core/samples` with real API calls
- [ ] Note: Currently using 36 comprehensive workout plans from core package as templates

---

## 📝 API Requirements

### Required Endpoints

```typescript
// Get user's planned activities
GET /api/mobile/planned-activities
Response: {
  data: Array<{
    id: string;
    activity_type: PublicActivityType;
    planned_date: string;
    plan: {
      name: string;
      structure: ActivityPlanStructure;
      duration_estimate: number;
      distance_estimate?: number;
      tss_estimate?: number;
    };
  }>
}

// Get activity templates by category
GET /api/mobile/templates?category=running
Response: {
  data: Array<{
    id: string;
    name: string;
    activity_type: PublicActivityType;
    structure: ActivityPlanStructure;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    duration_estimate: number;
  }>
}

// Generate PDF for activity plan
POST /api/mobile/activities/pdf
Body: { 
  activityPayload: ActivityPayload 
}
Response: { 
  url: string;
  expiresAt: string;
}
```

---

## 🧪 Testing Requirements

### Component Testing
```typescript
// Test ActivityCard interactions
describe('ActivityCard', () => {
  test('card body tap triggers onCardPress', () => {
    const onCardPress = jest.fn();
    const { getByTestId } = render(
      <ActivityCard activity={mockActivity} onCardPress={onCardPress} />
    );
    fireEvent.press(getByTestId('card-body'));
    expect(onCardPress).toHaveBeenCalled();
  });
  
  test('menu button tap triggers onMenuPress', () => {
    const onMenuPress = jest.fn();
    const { getByTestId } = render(
      <ActivityCard activity={mockActivity} onMenuPress={onMenuPress} />
    );
    fireEvent.press(getByTestId('menu-button'));
    expect(onMenuPress).toHaveBeenCalled();
  });
});
```

### Navigation Testing
```typescript
// Test smart routing logic
describe('RecordLauncher Navigation', () => {
  test('Quick Start navigates to record screen', () => {
    const { getByText } = render(<RecordLauncher />);
    fireEvent.press(getByText('Run'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/record',
      params: expect.objectContaining({
        payload: expect.stringContaining('"plan":null')
      })
    });
  });
});
```

---

## 📊 Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Time to start activity | 4-5 taps | 2-3 taps | Analytics events |
| User completion rate | 65% | 85% | Funnel analysis |
| Step visibility | Low | High | User can see all steps |
| Progress clarity | Medium | High | Graph shows completion |

---

## 🎯 Follow-Along Screen Features

### Design Principles
- **Simple Navigation**: Horizontal swipe between steps
- **Clear Progress**: Activity graph shows current position
- **Focus on Content**: Each step displayed with all relevant information
- **Easy Exit**: Close button always accessible

### Key Components
1. **Step Cards**: Display duration, targets, notes for each step
2. **Activity Graph**: Visual progress indicator with highlighted current step
3. **Navigation Controls**: Previous/Next buttons and dot indicators
4. **Responsive Layout**: Cards sized appropriately for mobile screens

---

*Last Updated: Added follow-along screen specification with horizontal carousel and activity graph*