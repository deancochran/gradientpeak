# Activity Plan UI/UX Improvement Implementation Plan

## Executive Summary

This document provides a comprehensive, research-backed implementation plan for three major UX improvements to the mobile app's activity plan creation interface:

1. **Segment-Based Workflow** - Organize workouts by logical sections with collapsible UI
2. **Interval Creation Wizard** - Inline modal with real-time preview
3. **Enhanced Timeline** - Visual segment divisions and groupings

**Note:** This plan assumes V2-only implementation (no V1 backward compatibility).

---

## Research Findings

### Current State Analysis

**✅ Backend is Segment-Ready:**
- V2 schema includes `segmentName`, `segmentIndex`, `originalRepetitionCount`
- `groupStepsBySegment()` utility function exists and is tested
- Plan Builder V2 automatically creates segment metadata during interval expansion
- All V2 sample workouts use segments (e.g., "Warmup", "VO2 Max", "Cooldown")

**❌ Mobile UI Not Leveraging Segments:**
- Structure editor shows flat list without grouping
- Timeline chart renders individual bars without segment divisions
- Step cards don't display segment information
- No UI for assigning segment names during creation
- `groupStepsBySegment()` is never called in mobile app

**🔄 Current Interval Creation Flow:**
- Navigate to separate `/structure/repeat` screen
- Edit repeat count and contained steps
- Manual management of nested `Repetition` structure
- No preview of expanded steps
- Saves as nested V1 structure (incompatible with V2)

---

## Architecture Overview

### V2 Data Structure

```typescript
interface ActivityPlanStructureV2 {
  version: 2;
  steps: PlanStepV2[];  // Flat array, NOT nested
}

interface PlanStepV2 {
  name: string;
  description?: string;
  notes?: string;
  duration: DurationV2;
  targets?: IntensityTargetV2[];  // max 3
  
  // Segment metadata
  segmentName?: string;              // "Warmup", "Intervals", "Cooldown"
  segmentIndex?: number;             // 0, 1, 2 (for intervals)
  originalRepetitionCount?: number;  // 3 (if from 3x repeat)
}
```

### Key Architectural Principles

1. **Flat Structure Only** - Store steps as flat array in V2 format
2. **Segment Metadata at Step Level** - Each step carries its own segment info
3. **Expansion at Creation Time** - Intervals expanded immediately, not during save
4. **Grouping at Display Time** - Use `groupStepsBySegment()` for UI rendering
5. **No Nested Repetitions** - Remove `StepOrRepetition` union type from store

---

## Implementation Plan

### Phase 1: Core V2 Migration (Foundation)

**Goal:** Migrate to pure V2 structure with flat steps only.

#### 1.1 Update Zustand Store

**File:** `apps/mobile/lib/stores/activityPlanCreation.ts`

**Changes:**

```typescript
import { type PlanStepV2, type ActivityPlanStructureV2 } from "@repo/core";

interface ActivityPlanCreationState {
  // V2 structure
  structure: ActivityPlanStructureV2;  // { version: 2, steps: PlanStepV2[] }
  
  // Actions
  addStep: (step: PlanStepV2) => void;
  addSteps: (steps: PlanStepV2[]) => void;  // NEW: Bulk add for intervals
  updateStep: (index: number, step: PlanStepV2) => void;
  removeStep: (index: number) => void;
  removeSteps: (indices: number[]) => void;  // NEW: Bulk remove
  reorderSteps: (steps: PlanStepV2[]) => void;
  
  // NEW: Segment management
  updateSegmentName: (oldName: string, newName: string) => void;
  removeSegment: (segmentName: string) => void;
  
  // REMOVE: addRepeat, updateRepeatAtIndex (no longer needed)
}

const initialState = {
  structure: {
    version: 2,
    steps: []
  }
};
```

**Implementation:**

```typescript
export const useActivityPlanCreationStore = create<ActivityPlanCreationState>(
  (set) => ({
    structure: { version: 2, steps: [] },
    
    addStep: (step) =>
      set((state) => ({
        structure: {
          version: 2,
          steps: [...state.structure.steps, step],
        },
      })),
    
    addSteps: (steps) =>
      set((state) => ({
        structure: {
          version: 2,
          steps: [...state.structure.steps, ...steps],
        },
      })),
    
    updateStep: (index, step) =>
      set((state) => {
        const newSteps = [...state.structure.steps];
        newSteps[index] = step;
        return {
          structure: { version: 2, steps: newSteps },
        };
      }),
    
    removeStep: (index) =>
      set((state) => ({
        structure: {
          version: 2,
          steps: state.structure.steps.filter((_, i) => i !== index),
        },
      })),
    
    removeSteps: (indices) =>
      set((state) => ({
        structure: {
          version: 2,
          steps: state.structure.steps.filter((_, i) => !indices.includes(i)),
        },
      })),
    
    reorderSteps: (steps) =>
      set({ structure: { version: 2, steps } }),
    
    updateSegmentName: (oldName, newName) =>
      set((state) => ({
        structure: {
          version: 2,
          steps: state.structure.steps.map((step) =>
            step.segmentName === oldName
              ? { ...step, segmentName: newName }
              : step
          ),
        },
      })),
    
    removeSegment: (segmentName) =>
      set((state) => ({
        structure: {
          version: 2,
          steps: state.structure.steps.filter(
            (step) => step.segmentName !== segmentName
          ),
        },
      })),
    
    reset: () => set({ structure: { version: 2, steps: [] } }),
  })
);
```

#### 1.2 Update Duration Conversion

**File:** `apps/mobile/lib/utils/durationConversion.ts` (NEW FILE)

```typescript
import type { Duration } from "@repo/core";  // V1
import type { DurationV2 } from "@repo/core";

/**
 * Convert V1 duration format to V2
 */
export function convertDurationToV2(duration: Duration): DurationV2 {
  if (duration === "untilFinished") {
    return { type: "untilFinished" };
  }
  
  switch (duration.type) {
    case "time":
      const seconds = duration.unit === "minutes" 
        ? duration.value * 60 
        : duration.value;
      return { type: "time", seconds };
    
    case "distance":
      const meters = duration.unit === "km" 
        ? duration.value * 1000 
        : duration.value;
      return { type: "distance", meters };
    
    case "repetitions":
      return { type: "repetitions", count: duration.value };
  }
}

/**
 * Convert V2 duration to V1 for display in forms
 */
export function convertDurationToV1(duration: DurationV2): Duration {
  if (duration.type === "untilFinished") {
    return "untilFinished";
  }
  
  switch (duration.type) {
    case "time":
      return {
        type: "time",
        value: duration.seconds >= 60 ? duration.seconds / 60 : duration.seconds,
        unit: duration.seconds >= 60 ? "minutes" : "seconds"
      };
    
    case "distance":
      return {
        type: "distance",
        value: duration.meters >= 1000 ? duration.meters / 1000 : duration.meters,
        unit: duration.meters >= 1000 ? "km" : "meters"
      };
    
    case "repetitions":
      return {
        type: "repetitions",
        value: duration.count,
        unit: "reps"
      };
  }
}
```

#### 1.3 Update Step Editor Dialog

**File:** `apps/mobile/components/ActivityPlan/StepEditorDialog.tsx`

**Changes:**

1. **Add segment name field:**

```typescript
<View>
  <Label nativeID="segment-name">Segment (Optional)</Label>
  <Controller
    control={form.control}
    name="segmentName"
    render={({ field: { onChange, value } }) => (
      <Input
        value={value || ""}
        onChangeText={onChange}
        placeholder="e.g., Warmup, Main Set, Cooldown"
        aria-labelledby="segment-name"
      />
    )}
  />
  <Text className="text-xs text-muted-foreground mt-1">
    Group steps into logical sections
  </Text>
</View>
```

2. **Add description field (before notes):**

```typescript
<View>
  <Label nativeID="step-description">Description (Optional)</Label>
  <Controller
    control={form.control}
    name="description"
    render={({ field: { onChange, value } }) => (
      <Textarea
        value={value || ""}
        onChangeText={onChange}
        placeholder="Brief description of this step..."
        className="min-h-[60px]"
      />
    )}
  />
</View>
```

3. **Update target limit to 3:**

```typescript
targets: z.array(intensityTargetSchema).max(3)

// Update UI validation message
{targets.length === 3 && (
  <Text className="text-xs text-muted-foreground mt-1">
    Maximum 3 targets per step
  </Text>
)}
```

4. **Convert duration to V2 on save:**

```typescript
import { convertDurationToV2 } from "@/lib/utils/durationConversion";

const handleSave = () => {
  const values = form.getValues();
  
  const stepV2: PlanStepV2 = {
    name: values.name,
    description: values.description,
    notes: values.notes,
    duration: convertDurationToV2(values.duration),
    targets: values.targets,
    segmentName: values.segmentName,
  };
  
  onSave(stepV2);
  onOpenChange(false);
};
```

---

### Phase 2: Segment-Based Workflow

**Goal:** Display and manage steps grouped by segments with collapsible sections.

#### 2.1 Create Segment Header Component

**File:** `apps/mobile/components/ActivityPlan/SegmentHeader.tsx` (NEW)

```typescript
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import * as Haptics from "expo-haptics";
import { ChevronDown, ChevronUp, Edit2, Trash2 } from "lucide-react-native";
import { View } from "react-native";

interface SegmentHeaderProps {
  segmentName: string;
  stepCount: number;
  duration: number;  // milliseconds
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function SegmentHeader({
  segmentName,
  stepCount,
  duration,
  isCollapsed,
  onToggleCollapse,
  onRename,
  onDelete,
}: SegmentHeaderProps) {
  const formatDuration = (ms: number): string => {
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  };

  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleCollapse();
  };

  const handleRename = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRename();
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDelete();
  };

  return (
    <View className="bg-muted/50 border border-border rounded-lg p-3 mb-2">
      <View className="flex-row items-center justify-between">
        {/* Left: Name and stats */}
        <View className="flex-1 flex-row items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onPress={handleToggle}
            className="p-1"
          >
            {isCollapsed ? (
              <ChevronDown size={18} className="text-foreground" />
            ) : (
              <ChevronUp size={18} className="text-foreground" />
            )}
          </Button>
          
          <View className="flex-1">
            <Text className="text-base font-semibold">{segmentName}</Text>
            <Text className="text-xs text-muted-foreground">
              {stepCount} step{stepCount !== 1 ? "s" : ""} • {formatDuration(duration)}
            </Text>
          </View>
        </View>

        {/* Right: Actions */}
        <View className="flex-row gap-1">
          <Button
            variant="ghost"
            size="sm"
            onPress={handleRename}
            className="p-2"
          >
            <Edit2 size={16} className="text-muted-foreground" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onPress={handleDelete}
            className="p-2"
          >
            <Trash2 size={16} className="text-destructive" />
          </Button>
        </View>
      </View>
    </View>
  );
}
```

#### 2.2 Update Structure Editor with Segment Grouping

**File:** `apps/mobile/app/(internal)/(tabs)/plan/create_activity_plan/structure/index.tsx`

**Major Changes:**

```typescript
import { groupStepsBySegment, type PlanStepV2 } from "@repo/core";
import { SegmentHeader } from "@/components/ActivityPlan/SegmentHeader";

export default function StructureEditScreen() {
  const [collapsedSegments, setCollapsedSegments] = useState<Set<string>>(new Set());
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  
  const { structure, addStep, addSteps, removeSegment, updateSegmentName } = 
    useActivityPlanCreationStore();

  // Group steps by segment
  const segments = useMemo(() => {
    return groupStepsBySegment(structure.steps);
  }, [structure.steps]);

  const toggleSegmentCollapse = (segmentName: string) => {
    setCollapsedSegments((prev) => {
      const next = new Set(prev);
      if (next.has(segmentName)) {
        next.delete(segmentName);
      } else {
        next.add(segmentName);
      }
      return next;
    });
  };

  const handleRenameSegment = (oldName: string) => {
    Alert.prompt(
      "Rename Segment",
      "Enter new name",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Rename",
          onPress: (newName) => {
            if (newName && newName !== oldName) {
              updateSegmentName(oldName, newName);
            }
          },
        },
      ],
      "plain-text",
      oldName
    );
  };

  const handleDeleteSegment = (segmentName: string, stepCount: number) => {
    Alert.alert(
      "Delete Segment",
      `Delete "${segmentName}" and its ${stepCount} step(s)?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => removeSegment(segmentName),
        },
      ]
    );
  };

  const renderSegmentGroup = (segment: { segmentName: string; steps: PlanStepV2[] }) => {
    const isCollapsed = collapsedSegments.has(segment.segmentName);
    const duration = segment.steps.reduce((total, step) => {
      return total + getDurationMs(step.duration);
    }, 0);

    return (
      <View key={segment.segmentName} className="mb-4">
        <SegmentHeader
          segmentName={segment.segmentName}
          stepCount={segment.steps.length}
          duration={duration}
          isCollapsed={isCollapsed}
          onToggleCollapse={() => toggleSegmentCollapse(segment.segmentName)}
          onRename={() => handleRenameSegment(segment.segmentName)}
          onDelete={() => handleDeleteSegment(segment.segmentName, segment.steps.length)}
        />
        
        {!isCollapsed && (
          <View className="pl-4">
            {segment.steps.map((step, index) => {
              const globalIndex = structure.steps.findIndex((s) => s === step);
              return (
                <StepCard
                  key={globalIndex}
                  step={step}
                  index={globalIndex}
                  onEdit={() => handleEditStep(globalIndex)}
                  onDelete={() => handleDeleteStep(globalIndex)}
                />
              );
            })}
          </View>
        )}
      </View>
    );
  };

  return (
    <View className="flex-1 bg-background">
      {/* Header with Add Segment and Add Step buttons */}
      <View className="bg-card border-b border-border px-4 py-3 flex-row justify-between">
        <Button variant="outline" size="sm" onPress={handleAddSegment}>
          <Text>+ Segment</Text>
        </Button>
        
        <Button variant="outline" size="sm" onPress={handleAddStep}>
          <Text>+ Step</Text>
        </Button>
        
        <Button variant="outline" size="sm" onPress={handleAddInterval}>
          <Text>+ Interval</Text>
        </Button>
      </View>

      {/* Timeline Chart */}
      <View className="bg-card border-b border-border px-4 py-3">
        <TimelineChartV2
          structure={structure}
          segments={segments}
          onSegmentPress={(segmentName) => setSelectedSegment(segmentName)}
        />
      </View>

      {/* Segment Groups */}
      <ScrollView className="flex-1 px-4 py-4">
        {segments.length === 0 ? (
          <View className="flex-1 items-center justify-center py-16">
            <Text className="text-lg text-muted-foreground mb-4">
              No steps added yet
            </Text>
            <Button onPress={handleAddStep}>
              <Text className="text-primary-foreground">+ Add First Step</Text>
            </Button>
          </View>
        ) : (
          segments.map(renderSegmentGroup)
        )}
      </ScrollView>
    </View>
  );
}
```

---

### Phase 3: Interval Creation Wizard

**Goal:** Replace separate repeat screen with inline modal that expands intervals immediately.

#### 3.1 Create Interval Wizard Component

**File:** `apps/mobile/components/ActivityPlan/IntervalWizard.tsx` (NEW)

```typescript
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { StepEditorDialog } from "@/components/ActivityPlan/StepEditorDialog";
import { convertDurationToV2 } from "@/lib/utils/durationConversion";
import { getDurationMs, type PlanStepV2 } from "@repo/core";
import { useState, useMemo } from "react";
import { View, ScrollView } from "react-native";
import Svg, { Rect } from "react-native-svg";

interface IntervalWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (steps: PlanStepV2[]) => void;
  activityType?: string;
}

export function IntervalWizard({
  open,
  onOpenChange,
  onSave,
  activityType,
}: IntervalWizardProps) {
  const [segmentName, setSegmentName] = useState("Intervals");
  const [repeatCount, setRepeatCount] = useState(4);
  const [workStep, setWorkStep] = useState<PlanStepV2 | null>(null);
  const [restStep, setRestStep] = useState<PlanStepV2 | null>(null);
  const [editingStep, setEditingStep] = useState<"work" | "rest" | null>(null);

  // Calculate preview metrics
  const preview = useMemo(() => {
    if (!workStep || !restStep) return null;
    
    const workDuration = getDurationMs(workStep.duration);
    const restDuration = getDurationMs(restStep.duration);
    const intervalDuration = workDuration + restDuration;
    const totalDuration = intervalDuration * repeatCount;
    const totalSteps = repeatCount * 2;

    return {
      workDuration,
      restDuration,
      intervalDuration,
      totalDuration,
      totalSteps,
    };
  }, [workStep, restStep, repeatCount]);

  const handleSave = () => {
    if (!workStep || !restStep) {
      Alert.alert("Missing Steps", "Please configure both work and rest steps");
      return;
    }

    const expandedSteps: PlanStepV2[] = [];
    
    for (let i = 0; i < repeatCount; i++) {
      expandedSteps.push({
        ...workStep,
        segmentName,
        segmentIndex: i,
        originalRepetitionCount: repeatCount,
      });
      
      expandedSteps.push({
        ...restStep,
        segmentName,
        segmentIndex: i,
        originalRepetitionCount: repeatCount,
      });
    }

    onSave(expandedSteps);
    onOpenChange(false);
    
    // Reset for next use
    setSegmentName("Intervals");
    setRepeatCount(4);
    setWorkStep(null);
    setRestStep(null);
  };

  const renderPreview = () => {
    if (!preview) return null;

    const formatDuration = (ms: number) => {
      const mins = Math.floor(ms / 60000);
      const secs = Math.floor((ms % 60000) / 1000);
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    return (
      <View className="border border-border rounded-lg p-4 bg-muted/30">
        <Text className="text-sm font-medium mb-2">Preview</Text>
        
        {/* Stats */}
        <View className="flex-row justify-between mb-3">
          <View>
            <Text className="text-xs text-muted-foreground">Total Steps</Text>
            <Text className="text-base font-semibold">{preview.totalSteps}</Text>
          </View>
          <View>
            <Text className="text-xs text-muted-foreground">Total Duration</Text>
            <Text className="text-base font-semibold">
              {formatDuration(preview.totalDuration)}
            </Text>
          </View>
          <View>
            <Text className="text-xs text-muted-foreground">Per Interval</Text>
            <Text className="text-base font-semibold">
              {formatDuration(preview.intervalDuration)}
            </Text>
          </View>
        </View>

        {/* Visual Timeline */}
        <View className="h-20 bg-background rounded-md border border-border overflow-hidden">
          <Svg width="100%" height="100%" viewBox="0 0 300 80">
            {Array.from({ length: repeatCount }).map((_, i) => {
              const workWidth = (preview.workDuration / preview.totalDuration) * 300;
              const restWidth = (preview.restDuration / preview.totalDuration) * 300;
              const x = ((workWidth + restWidth) * i);
              
              return (
                <React.Fragment key={i}>
                  {/* Work bar */}
                  <Rect
                    x={x}
                    y={20}
                    width={workWidth}
                    height={40}
                    fill="#ef4444"
                    opacity={0.9}
                    rx={4}
                  />
                  {/* Rest bar */}
                  <Rect
                    x={x + workWidth}
                    y={20}
                    width={restWidth}
                    height={40}
                    fill="#10b981"
                    opacity={0.7}
                    rx={4}
                  />
                </React.Fragment>
              );
            })}
          </Svg>
        </View>
        
        <Text className="text-xs text-muted-foreground text-center mt-2">
          {repeatCount} × [{workStep?.name} + {restStep?.name}]
        </Text>
      </View>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[90%] max-h-[85%]">
          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="gap-4 p-4">
              {/* Title */}
              <Text className="text-xl font-semibold">Create Interval Set</Text>

              {/* Segment Name */}
              <View>
                <Label nativeID="segment-name">Segment Name</Label>
                <Input
                  value={segmentName}
                  onChangeText={setSegmentName}
                  placeholder="e.g., Main Set, VO2 Max, Threshold"
                />
              </View>

              {/* Work Step */}
              <View>
                <Label className="mb-2">Work Step</Label>
                {workStep ? (
                  <View className="border border-border rounded-lg p-3 bg-muted/30">
                    <View className="flex-row justify-between items-center">
                      <View className="flex-1">
                        <Text className="font-medium">{workStep.name}</Text>
                        <Text className="text-sm text-muted-foreground">
                          {/* Format duration and targets */}
                        </Text>
                      </View>
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => setEditingStep("work")}
                      >
                        <Text>Edit</Text>
                      </Button>
                    </View>
                  </View>
                ) : (
                  <Button
                    variant="outline"
                    onPress={() => setEditingStep("work")}
                    className="w-full"
                  >
                    <Text>+ Configure Work Step</Text>
                  </Button>
                )}
              </View>

              {/* Rest Step */}
              <View>
                <Label className="mb-2">Rest Step</Label>
                {restStep ? (
                  <View className="border border-border rounded-lg p-3 bg-muted/30">
                    <View className="flex-row justify-between items-center">
                      <View className="flex-1">
                        <Text className="font-medium">{restStep.name}</Text>
                        <Text className="text-sm text-muted-foreground">
                          {/* Format duration and targets */}
                        </Text>
                      </View>
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => setEditingStep("rest")}
                      >
                        <Text>Edit</Text>
                      </Button>
                    </View>
                  </View>
                ) : (
                  <Button
                    variant="outline"
                    onPress={() => setEditingStep("rest")}
                    className="w-full"
                  >
                    <Text>+ Configure Rest Step</Text>
                  </Button>
                )}
              </View>

              {/* Repeat Count */}
              <View>
                <Label nativeID="repeat-count">Repeat Count</Label>
                <Input
                  value={repeatCount.toString()}
                  onChangeText={(text) => {
                    const num = parseInt(text);
                    if (!isNaN(num) && num > 0) setRepeatCount(num);
                  }}
                  keyboardType="numeric"
                  placeholder="4"
                />
              </View>

              {/* Preview */}
              {preview && renderPreview()}

              {/* Actions */}
              <View className="flex-row gap-3 mt-4">
                <Button
                  variant="outline"
                  onPress={() => onOpenChange(false)}
                  className="flex-1"
                >
                  <Text>Cancel</Text>
                </Button>
                <Button
                  onPress={handleSave}
                  disabled={!workStep || !restStep}
                  className="flex-1"
                >
                  <Text className="text-primary-foreground">Create Interval</Text>
                </Button>
              </View>
            </View>
          </ScrollView>
        </DialogContent>
      </Dialog>

      {/* Step Editor for Work/Rest configuration */}
      <StepEditorDialog
        open={editingStep !== null}
        onOpenChange={(open) => !open && setEditingStep(null)}
        step={editingStep === "work" ? workStep : restStep}
        onSave={(step) => {
          if (editingStep === "work") setWorkStep(step);
          else if (editingStep === "rest") setRestStep(step);
          setEditingStep(null);
        }}
        activityType={activityType}
      />
    </>
  );
}
```

#### 3.2 Remove Old Repeat Screen

**Action:** Delete or deprecate:
- `apps/mobile/app/(internal)/(tabs)/plan/create_activity_plan/structure/repeat/index.tsx`
- `apps/mobile/components/ActivityPlan/RepeatCard.tsx`

---

### Phase 4: Enhanced Timeline with Segments

**Goal:** Visual timeline that shows segment divisions, groupings, and interval patterns.

#### 4.1 Create Enhanced Timeline Component

**File:** `apps/mobile/components/ActivityPlan/TimelineChartV2.tsx` (NEW)

```typescript
import { Text } from "@/components/ui/text";
import {
  groupStepsBySegment,
  getDurationMs,
  getStepIntensityColor,
  type ActivityPlanStructureV2,
  type PlanStepV2,
} from "@repo/core";
import * as Haptics from "expo-haptics";
import { useMemo } from "react";
import { TouchableWithoutFeedback, View, ScrollView } from "react-native";
import Svg, { Rect, Line, Text as SvgText } from "react-native-svg";

interface TimelineChartV2Props {
  structure: ActivityPlanStructureV2;
  segments: Array<{ segmentName: string; steps: PlanStepV2[] }>;
  selectedSegment?: string;
  onSegmentPress?: (segmentName: string) => void;
  height?: number;
}

export function TimelineChartV2({
  structure,
  segments,
  selectedSegment,
  onSegmentPress,
  height = 140,
}: TimelineChartV2Props) {
  const chartHeight = height - 40; // Reserve space for labels

  const chartData = useMemo(() => {
    const totalDuration = structure.steps.reduce((total, step) => {
      return total + getDurationMs(step.duration);
    }, 0);

    if (totalDuration === 0) return [];

    const data: Array<{
      segment: string;
      steps: Array<{
        step: PlanStepV2;
        widthPercent: number;
        color: string;
      }>;
      widthPercent: number;
      startPercent: number;
    }> = [];

    let currentPercent = 0;

    segments.forEach((segment) => {
      const segmentDuration = segment.steps.reduce((total, step) => {
        return total + getDurationMs(step.duration);
      }, 0);

      const segmentWidthPercent = (segmentDuration / totalDuration) * 100;

      const segmentSteps = segment.steps.map((step) => {
        const stepDuration = getDurationMs(step.duration);
        const widthPercent = (stepDuration / totalDuration) * 100;
        const color = getStepIntensityColor(step);

        return { step, widthPercent, color };
      });

      data.push({
        segment: segment.segmentName,
        steps: segmentSteps,
        widthPercent: segmentWidthPercent,
        startPercent: currentPercent,
      });

      currentPercent += segmentWidthPercent;
    });

    return data;
  }, [structure.steps, segments]);

  if (chartData.length === 0) {
    return (
      <View
        style={{ height }}
        className="border-2 border-dashed border-muted rounded-lg items-center justify-center"
      >
        <Text className="text-muted-foreground">No steps to display</Text>
      </View>
    );
  }

  const chartWidth = 300;

  return (
    <View style={{ height }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ width: chartWidth }}>
          {/* Segment Labels */}
          <View className="flex-row mb-2">
            {chartData.map((segmentData, idx) => {
              const isSelected = segmentData.segment === selectedSegment;
              const x = (segmentData.startPercent / 100) * chartWidth;
              const width = (segmentData.widthPercent / 100) * chartWidth;

              return (
                <TouchableWithoutFeedback
                  key={idx}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onSegmentPress?.(segmentData.segment);
                  }}
                >
                  <View
                    style={{
                      position: "absolute",
                      left: x,
                      width: width,
                    }}
                    className={`px-1 py-0.5 rounded ${
                      isSelected ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <Text
                      className={`text-xs font-medium text-center ${
                        isSelected ? "text-primary-foreground" : "text-foreground"
                      }`}
                      numberOfLines={1}
                    >
                      {segmentData.segment}
                    </Text>
                  </View>
                </TouchableWithoutFeedback>
              );
            })}
          </View>

          {/* SVG Timeline */}
          <Svg width={chartWidth} height={chartHeight}>
            {chartData.map((segmentData, segIdx) => {
              let stepX = (segmentData.startPercent / 100) * chartWidth;

              return (
                <React.Fragment key={segIdx}>
                  {/* Segment divider line */}
                  {segIdx > 0 && (
                    <Line
                      x1={stepX}
                      y1={0}
                      x2={stepX}
                      y2={chartHeight}
                      stroke="#64748b"
                      strokeWidth={2}
                      strokeDasharray="4,4"
                    />
                  )}

                  {/* Steps within segment */}
                  {segmentData.steps.map((stepData, stepIdx) => {
                    const stepWidth = (stepData.widthPercent / 100) * chartWidth;
                    const intensity = stepData.step.targets?.[0]?.intensity || 50;
                    const barHeight = (intensity / 100) * (chartHeight - 20);
                    const barY = chartHeight - barHeight - 10;

                    const rect = (
                      <Rect
                        key={stepIdx}
                        x={stepX}
                        y={barY}
                        width={stepWidth - 2} // Small gap
                        height={barHeight}
                        fill={stepData.color}
                        opacity={0.85}
                        rx={4}
                      />
                    );

                    stepX += stepWidth;
                    return rect;
                  })}
                </React.Fragment>
              );
            })}
          </Svg>
        </View>
      </ScrollView>
    </View>
  );
}
```

---

## Implementation Timeline

### Week 1: Foundation (Phase 1)

- **Day 1-2:** Update Zustand store to V2 structure
- **Day 3:** Create duration conversion utilities
- **Day 4-5:** Update StepEditorDialog with V2 fields

**Testing:** Ensure basic step creation works with V2 structure

---

### Week 2: Segments (Phase 2)

- **Day 1-2:** Create SegmentHeader component
- **Day 3-4:** Refactor structure editor with segment grouping
- **Day 5:** Add segment management (rename, delete)

**Testing:** Verify segment grouping, collapsing, and management

---

### Week 3: Intervals (Phase 3)

- **Day 1-3:** Build IntervalWizard component with preview
- **Day 4:** Integrate wizard into structure editor
- **Day 5:** Remove old repeat screen and components

**Testing:** Create complex interval workouts and verify expansion

---

### Week 4: Enhanced Timeline (Phase 4)

- **Day 1-3:** Build TimelineChartV2 with segment visualization
- **Day 4:** Replace old timeline in all screens
- **Day 5:** Polish and optimize rendering

**Testing:** Performance with large workouts (200 steps)

---

## Testing Strategy

### Unit Tests

```typescript
// activityPlanCreation.test.ts
describe("ActivityPlanCreationStore", () => {
  it("should add steps in V2 format", () => {
    const store = useActivityPlanCreationStore.getState();
    const step: PlanStepV2 = {
      name: "Test",
      duration: { type: "time", seconds: 600 },
    };
    
    store.addStep(step);
    
    expect(store.structure.version).toBe(2);
    expect(store.structure.steps).toHaveLength(1);
  });

  it("should group and update segment names", () => {
    // Test updateSegmentName action
  });

  it("should remove entire segments", () => {
    // Test removeSegment action
  });
});

// durationConversion.test.ts
describe("Duration Conversion", () => {
  it("should convert V1 time to V2", () => {
    const v1 = { type: "time", value: 10, unit: "minutes" };
    const v2 = convertDurationToV2(v1);
    expect(v2).toEqual({ type: "time", seconds: 600 });
  });

  it("should convert V1 distance to V2", () => {
    const v1 = { type: "distance", value: 5, unit: "km" };
    const v2 = convertDurationToV2(v1);
    expect(v2).toEqual({ type: "distance", meters: 5000 });
  });
});
```

### Integration Tests

```typescript
// IntervalWizard.test.tsx
describe("IntervalWizard", () => {
  it("should expand intervals with segment metadata", () => {
    // Create 4x (Work 4min + Rest 2min)
    // Verify 8 steps created with segmentIndex 0-3
  });

  it("should calculate preview metrics correctly", () => {
    // Verify step count, duration calculations
  });
});

// StructureEditor.test.tsx
describe("StructureEditor with Segments", () => {
  it("should group steps by segment", () => {
    // Verify groupStepsBySegment is called
    // Verify segments render correctly
  });

  it("should collapse and expand segments", () => {
    // Toggle collapse, verify steps hidden/shown
  });
});
```

### E2E Tests

```typescript
// activityPlanCreation.e2e.ts
describe("Activity Plan Creation E2E", () => {
  it("should create structured workout with segments", async () => {
    // 1. Create warmup segment with 2 steps
    // 2. Add interval set (4x [Hard + Recovery])
    // 3. Add cooldown segment with 1 step
    // 4. Save plan
    // 5. Reload and verify structure
  });

  it("should handle segment management", async () => {
    // Rename segment, delete segment, reorder steps
  });
});
```

---

## Success Metrics

### Functional Requirements

- ✅ All plans created as V2 structure with `version: 2`
- ✅ Segments displayed and manageable in UI
- ✅ Intervals expanded inline with real-time preview
- ✅ Timeline shows segment divisions clearly
- ✅ Support up to 3 targets per step
- ✅ Step description and segment name fields functional

### UX Metrics

- ✅ Plan creation time reduced by 40% with interval wizard
- ✅ Segment organization improves workout clarity (user feedback)
- ✅ Timeline immediately shows workout structure
- ✅ Collapsible segments reduce scroll distance for large plans

### Performance Metrics

- ✅ Render 200-step plans in <1 second
- ✅ Segment collapse/expand is instant
- ✅ Drag-and-drop remains smooth with 50+ steps
- ✅ Timeline chart renders without jank

---

## Migration Notes

**Since we're NOT supporting V1 backward compatibility:**

1. **Clean Break:** Remove all V1-related code (StepOrRepetition, flattenPlanSteps in mobile app)
2. **Data Loss Prevention:** Warn users before updating if they have existing V1 plans
3. **Optional:** Provide one-time migration script to convert V1 plans to V2 in database

---

## File Summary

### Files to Create

1. `apps/mobile/lib/utils/durationConversion.ts`
2. `apps/mobile/components/ActivityPlan/SegmentHeader.tsx`
3. `apps/mobile/components/ActivityPlan/IntervalWizard.tsx`
4. `apps/mobile/components/ActivityPlan/TimelineChartV2.tsx`

### Files to Update

1. `apps/mobile/lib/stores/activityPlanCreation.ts` - V2 structure
2. `apps/mobile/components/ActivityPlan/StepEditorDialog.tsx` - Add fields, conversion
3. `apps/mobile/app/(internal)/(tabs)/plan/create_activity_plan/structure/index.tsx` - Segment grouping
4. `apps/mobile/lib/hooks/forms/useActivityPlanForm.ts` - Submit V2 format

### Files to Remove

1. `apps/mobile/app/(internal)/(tabs)/plan/create_activity_plan/structure/repeat/index.tsx`
2. `apps/mobile/components/ActivityPlan/RepeatCard.tsx`
3. `apps/mobile/components/ActivityPlan/TimelineChart.tsx` (replace with V2)

---

## Appendix: Sample Workouts with Segments

### Example 1: Sweet Spot Intervals

```typescript
{
  version: 2,
  steps: [
    { name: "Warmup", duration: { type: "time", seconds: 600 }, segmentName: "Warmup", ... },
    { name: "Build", duration: { type: "time", seconds: 300 }, segmentName: "Warmup", ... },
    
    // Interval 0
    { name: "Sweet Spot", duration: { type: "time", seconds: 600 }, segmentName: "Sweet Spot", segmentIndex: 0, originalRepetitionCount: 3, ... },
    { name: "Recovery", duration: { type: "time", seconds: 300 }, segmentName: "Sweet Spot", segmentIndex: 0, originalRepetitionCount: 3, ... },
    
    // Interval 1
    { name: "Sweet Spot", duration: { type: "time", seconds: 600 }, segmentName: "Sweet Spot", segmentIndex: 1, originalRepetitionCount: 3, ... },
    { name: "Recovery", duration: { type: "time", seconds: 300 }, segmentName: "Sweet Spot", segmentIndex: 1, originalRepetitionCount: 3, ... },
    
    // Interval 2
    { name: "Sweet Spot", duration: { type: "time", seconds: 600 }, segmentName: "Sweet Spot", segmentIndex: 2, originalRepetitionCount: 3, ... },
    { name: "Recovery", duration: { type: "time", seconds: 300 }, segmentName: "Sweet Spot", segmentIndex: 2, originalRepetitionCount: 3, ... },
    
    { name: "Cooldown", duration: { type: "time", seconds: 600 }, segmentName: "Cooldown", ... },
  ]
}
```

### Example 2: Strength Training

```typescript
{
  version: 2,
  steps: [
    { name: "Warmup", duration: { type: "time", seconds: 300 }, segmentName: "Warmup", ... },
    
    // Squats (3 sets)
    { name: "Squats", duration: { type: "repetitions", count: 8 }, segmentName: "Squats", segmentIndex: 0, originalRepetitionCount: 3, ... },
    { name: "Rest", duration: { type: "time", seconds: 90 }, segmentName: "Squats", segmentIndex: 0, originalRepetitionCount: 3, ... },
    { name: "Squats", duration: { type: "repetitions", count: 8 }, segmentName: "Squats", segmentIndex: 1, originalRepetitionCount: 3, ... },
    { name: "Rest", duration: { type: "time", seconds: 90 }, segmentName: "Squats", segmentIndex: 1, originalRepetitionCount: 3, ... },
    { name: "Squats", duration: { type: "repetitions", count: 8 }, segmentName: "Squats", segmentIndex: 2, originalRepetitionCount: 3, ... },
    { name: "Rest", duration: { type: "time", seconds: 90 }, segmentName: "Squats", segmentIndex: 2, originalRepetitionCount: 3, ... },
    
    // Bench Press (3 sets)
    { name: "Bench Press", duration: { type: "repetitions", count: 8 }, segmentName: "Bench Press", segmentIndex: 0, originalRepetitionCount: 3, ... },
    { name: "Rest", duration: { type: "time", seconds: 90 }, segmentName: "Bench Press", segmentIndex: 0, originalRepetitionCount: 3, ... },
    // ... more sets ...
    
    { name: "Cooldown", duration: { type: "time", seconds: 300 }, segmentName: "Cooldown", ... },
  ]
}
```

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-14  
**Status:** Ready for Implementation
