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
                ├── ActivityTabs.tsx      # NEW: Tab container
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
  structure: activityPlanStructureSchema
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

```typescript
import { ActivityTabs } from "@/components/record/ActivityTabs";
import { isContinuousActivity, type ActivityPayload } from "@repo/core/types/activity";
import { useRouter } from "expo-router";
import { View } from "react-native";

export default function RecordLauncher() {
  const router = useRouter();
  
  const handleActivitySelected = (payload: ActivityPayload) => {
    // Smart routing based on activity type and plan
    const isContinuous = isContinuousActivity(payload.type);
    const hasStructure = !!payload.plan?.structure;
    
    // Serialize payload for URL params
    const params = { payload: JSON.stringify(payload) };
    
    if (!hasStructure || isContinuous) {
      // Quick start or continuous structured → Record screen
      router.push({
        pathname: "/
    <View style={{ flex: 1 }}>
      <ActivityTabs onActivitySelected={handleActivitySelected} />
    </View>supabase";
import React from "react";
import { TouchableOpacity, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { MoreVertical } from "lucide-react-native";
import { ACTIVITY_ICONS } from "@/lib/services/ActivityRecorder/types";

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
    <TouchableOpacity 
      onPress={onCardPress}
      className="bg-card rounded-xl mb-3 overflow-hidden"
    >
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
      
      {/* Mini activity graph placeholder */}
      {activity.plan?.structure && (
        <View className="h-12 bg-muted/30 px-4 pb-2">
          {/* Add IntervalGraph component here */}
        </View>
      )}
    </TouchableOpacity>
  );
}
```

### 4. Updated Record Screen Handler

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

### 5. Service Enhancement

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
| **Quick Start** | Simple list of continuous activity types with icons | Tap → Launch with `plan: null` | Static list filtered by `isContinuousActivity()` |
| **Planned Activities** | Activity cards with metrics and mini-graphs | Card tap → Launch<br>Menu tap → Utilities | `planned_activities` table via API |
| **Templates** | Two-state nested navigation (Categories → Templates) | Category tap → Show templates<br>Template tap → Launch | `activity_plans` table filtered by category |

### Templates Tab: Nested Navigation Flow

#### State 1: Category Selection
```typescript
const CATEGORIES = [
  { id: 'running', name: 'Running Plans', icon: Run },
  { id: 'cycling', name: 'Cycling Workouts', icon: Bike },
  { id: 'strength', name: 'Strength Routines', icon: Dumbbell },
  { id: 'hiit', name: 'HIIT Sessions', icon: Zap },
];
```

#### State 2: Template List
- Shows filtered templates for selected category
- Each template is an `ActivityCard` with full plan structure
- Back button returns to category selection

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

### Interaction Model

| User Action | System Response | Navigation |
|------------|----------------|------------|
| Tap Quick Start item | Create payload with `plan: null` | → `/record` |
| Tap activity card body | Create payload with full plan | → `/record` or `/follow-along` |
| Tap menu button (⋮) | Show action sheet | Stay on current screen |
| Select "Generate PDF" | Call PDF API | Show share dialog |
| Select "Share" | Open share sheet | Native share UI |

### Visual Hierarchy

1. **Tab Bar**: Primary navigation (Quick Start | Planned | Templates)
2. **Content Area**: Scrollable list of activities/categories
3. **Activity Cards**: 
   - Primary tap target (85% of card area)
   - Secondary menu button (15% of card area)
   - Visual separation via subtle border/shadow

---

## 🔨 Implementation Steps

### Phase 1: Core Infrastructure (2 days)
- [x] Analyze existing types and schemas
- [ ] Create `@gradientpeak/core/types/activity.ts`
- [ ] Add helper functions for activity categorization
- [ ] Update `@gradientpeak/core/index.ts` exports

### Phase 2: UI Components (3 days)
- [ ] Build `ActivityTabs` component with three tabs
- [ ] Create `ActivityCard` with dual tap targets
- [ ] Implement `QuickStartList` (filtered continuous activities)
- [ ] Implement `PlannedActivitiesList` with API integration
- [ ] Implement `TemplatesList` with nested navigation

### Phase 3: Navigation Updates (2 days)
- [ ] Update `record-launcher.tsx` to show tabs
- [ ] Add smart routing logic to handle payloads
- [ ] Update `/record/index.tsx` to parse params
- [ ] Create `/follow-along/index.tsx` for step-based activities

### Phase 4: Service Integration (2 days)
- [ ] Add `selectActivityFromPayload()` to ActivityRecorderService
- [ ] Update hooks to handle new navigation flow
- [ ] Ensure plan selection works with plannedActivityId

### Phase 5: API Integration (2 days)
- [ ] Implement `useQuickStartActivities()` hook
- [ ] Create `usePlannedActivities()` with React Query
- [ ] Build `useTemplates()` with category filtering
- [ ] Add PDF generation endpoint

---

## 🚦 Migration Strategy

### Current → Target State Mapping

| Current Implementation | Target Implementation | Changes Required |
|----------------------|----------------------|------------------|
| Direct push to `/record` | Tab-based launcher | Replace redirect with `ActivityTabs` |
| Activity selection in record screen | Pre-selection in launcher | Move selection logic to launcher |
| No activity preview | Rich activity cards | Create `ActivityCard` component |
| Single navigation path | Smart routing | Add routing logic based on type/plan |
| No templates | Template browser | Add `TemplatesList` component |

### Backward Compatibility
- Keep existing `/record/activity` screen for fallback
- Support direct navigation to `/record` without params (shows activity selection)
- Maintain existing service methods alongside new ones

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

### Unit Tests
```typescript
// Test activity categorization
describe('Activity Helpers', () => {
  test('correctly identifies continuous activities', () => {
    expect(isContinuousActivity('outdoor_run')).toBe(true);
    expect(isContinuousActivity('indoor_strength')).toBe(false);
  });
  
  test('correctly identifies outdoor activities', () => {
    expect(isOutdoorActivity('outdoor_bike')).toBe(true);
    expect(isOutdoorActivity('indoor_bike_trainer')).toBe(false);
  });
});

// Test payload validation
describe('ActivityPayload', () => {
  test('validates payload without intent field', () => {
    const payload = {
      type: 'outdoor_run',
      plannedActivityId: '123',
      plan: null
    };
    expect(ActivityPayloadSchema.parse(payload)).toBeDefined();
  });
});
```

### Integration Tests
- Tab navigation between Quick Start, Planned, Templates
- Card tap vs menu tap interaction
- Templates category → template list navigation
- Parameter passing to record/follow-along screens

### E2E Test Scenarios
1. Quick Start Flow: Tab → Quick Start → Run → Record Screen
2. Planned Activity: Tab → Planned → Card Tap → Record Screen
3. Template Selection: Tab → Templates → Category → Template → Follow-along
4. PDF Generation: Tab → Planned → Menu → Generate PDF → Share

---

## 📊 Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Time to start activity | 4-5 taps | 2-3 taps | Analytics events |
| User completion rate | 65% | 85% | Funnel analysis |
| Code complexity | High (intent logic) | Low (interaction-based) | Cyclomatic complexity |
| Component reusability | Low | High | Shared component count |

---

## 🤝 Delivery Checklist

### Phase 1 Complete
- [ ] Core types created and exported
- [ ] Helper functions tested
- [ ] Schema validation working

### Phase 2 Complete  
- [ ] All UI components built
- [ ] Dual tap targets working
- [ ] Nested navigation functional

### Phase 3 Complete
- [ ] Navigation flow implemented
- [ ] Smart routing working
- [ ] Parameter passing tested

### Phase 4 Complete
- [ ] Service methods updated
- [ ] Hooks integrated
- [ ] Plan selection working

### Phase 5 Complete
- [ ] API endpoints integrated
- [ ] PDF generation working
- [ ] All tests passing

### Final Delivery
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Performance benchmarks met
- [ ] Accessibility tested
- [ ] Ready for production

---

## 📚 References

- Activity Types: `packages/supabase/supazod/schemas.ts`
- Plan Structure: `packages/core/schemas/activity_plan_structure.ts`
- Recording Service: `apps/mobile/src/lib/services/ActivityRecorder/index.ts`
- Current Navigation: `apps/mobile/src/app/(internal)/(tabs)/record-launcher.tsx`

---

*Last Updated: Complete implementation analysis with current state mapping and detailed component specifications*