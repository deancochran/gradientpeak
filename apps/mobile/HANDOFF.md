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
import { ChevronLeft, Footprints, Bike, Dumbbell, Zap } from 'lucide-react-native';
import { PublicActivityType } from '@repo/supabase';

const CATEGORIES = [
  { id: 'running', name: 'Running Plans', icon: Footprints },
  { id: 'cycling', name: 'Cycling Workouts', icon: Bike },
  { id: 'strength', name: 'Strength
 Routines', icon: Dumbbell },
  { id: 'hiit', name: 'HIIT Sessions', icon: Zap },
];

// Mock data - will be replaced with API call
const getTemplatesByCategory = (category: string) => {
  return [
    { 
      id: '1', 
      type: 'outdoor_run' as PublicActivityType, 
      title: '5K Training Run',
      duration: 1800,
      plan: { 
        name: '5K Training Run',
        structure: { /* structured plan data */ }
      }
    },
    { 
      id: '2', 
      type: 'indoor_bike_trainer' as PublicActivityType, 
      title: 'Sweet Spot Intervals',
      duration: 2400,
      plan: { 
        name: 'Sweet Spot Intervals',
        structure: { /* structured plan data */ }
      }
    },
  ];
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

interface PlannedActivitiesListProps {
  onSelect: (activity: any) => void;
  onMenuPress: (activity: any) => void;
}

export function PlannedActivitiesList({ onSelect, onMenuPress }: PlannedActivitiesListProps) {
  // TODO: Replace with actual API call
  const { data: activities, isLoading } = useQuery({
    queryKey: ['planned-activities'],
    queryFn: async () => {
      // Mock data - replace with actual API call
      return [
        {
          id: '1',
          type: 'outdoor_run',
          title: 'Morning Run',
          plannedDate: new Date(),
          duration: 1800,
          distance: 5,
          plan: {
            name: 'Easy Run',
            structure: { /* plan structure */ }
          }
        },
        {
          id: '2',
          type: 'indoor_bike_trainer',
          title: 'Evening Intervals',
          plannedDate: new Date(),
          duration: 3600,
          tss: 85,
          plan: {
            name: 'Sweet Spot Intervals',
            structure: { /* plan structure */ }
          }
        }
      ];
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
          onCardPress={() => onSelect(item)}
          onMenuPress={() => onMenuPress(item)}
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

#### Quick Start (No Plan)
```json
{
  "type": "outdoor_run",
  "plannedActivityId": null,
  "plan": null
}
```

#### Planned Activity (With Structure)
```json
{
  "type": "indoor_bike_trainer",
  "plannedActivityId": "uuid-123",
  "plan": {
    "name": "Sweet Spot Intervals",
    "structure": {
      "steps": [
        { "type": "step", "name": "Warm Up", "duration": { "type": "time", "value": 10, "unit": "minutes" } },
        { "type": "step", "name": "Main Set", "duration": { "type": "time", "value": 20, "unit": "minutes" } }
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
- [ ] Create templates API with category filtering
- [ ] Add PDF generation endpoint
- [ ] Replace mock data with real API calls

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
| User completion rate | 65%