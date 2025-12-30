# Visual Activity Builder - Implementation Plan

## Executive Summary

This plan reimagines the activity creation experience from a form-based approach to a visual, tactile builder. The design leverages existing V2 data structures, TRPC APIs, and React Native components while introducing a drag-and-drop block-based interface that makes workout creation feel effortless.

**Key Design Principles:**
- Visual blocks representing intervals (not individual steps)
- Quick Start screen for Templates, Public Activities, and Routes
- Slider-based editing for duration/intensity
- Maintain flat V2 step structure (no backend changes)
- Progressive enhancement (MVP → Full features)

---

## 1. File Structure & Organization

### New Files to Create

```
apps/mobile/app/(internal)/(tabs)/plan/builder/
├── index.tsx                          # Quick Start Screen (entry point)
├── visual/
│   ├── index.tsx                      # Visual Builder Canvas
│   ├── components/
│   │   ├── IntervalBlock.tsx          # Draggable interval block
│   │   ├── IntervalBlockExpanded.tsx  # Expanded view with steps
│   │   ├── StepBlockMini.tsx          # Mini step representation
│   │   ├── BuilderCanvas.tsx          # Main drag-drop area
│   │   ├── BuilderToolbar.tsx         # Top toolbar (Save, Cancel, etc)
│   │   ├── AddIntervalSheet.tsx       # Bottom sheet for adding intervals
│   │   └── QuickEditSlider.tsx        # Inline slider for duration/intensity
│   └── hooks/
│       ├── useBuilderState.ts         # Local builder state management
│       ├── useIntervalBlocks.ts       # Transform V2 steps ↔ blocks
│       └── useBlockDragDrop.ts        # Drag-drop logic
├── templates/
│   └── index.tsx                      # Template browser (36 samples)
├── public/
│   ├── activities.tsx                 # Public activities browser
│   └── routes.tsx                     # Public routes browser
└── store/
    └── visualBuilderStore.ts          # Zustand store for builder state
```

### Files to Modify

```
apps/mobile/app/(internal)/(tabs)/plan/
├── index.tsx                          # Add navigation to builder
├── library/index.tsx                  # Add "Open in Visual Builder" option
└── create_activity_plan/
    └── index.tsx                      # Add toggle to switch to visual mode

apps/mobile/lib/constants/routes.ts    # Add new builder routes

apps/mobile/components/ActivityPlan/
├── TimelineChart.tsx                  # Enhance for interval grouping
└── (keep all other existing components)

apps/mobile/package.json               # Add @react-native-community/slider
```

### Files to Keep (Reusable)

- `TimelineChart.tsx` - Adapt for interval visualization
- `StepEditorDialog.tsx` - Use for detailed step editing
- `IntervalWizard.tsx` - Reference for interval creation patterns
- `StepCard.tsx` - Adapt for mini step blocks
- `useActivityPlanCreationStore.ts` - Keep for backward compatibility

---

## 2. Component Hierarchy & Communication

### Visual Builder Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ VisualBuilderScreen (index.tsx)                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ BuilderToolbar                                          │ │
│ │ [Cancel] [Title] [Preview] [Save]                      │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Horizontal TimelineChart (collapsed intervals)          │ │
│ │ [==] [===] [=] [===] [==]  - Visual overview           │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ScrollView (BuilderCanvas)                              │ │
│ │                                                           │ │
│ │  ┌─────────────────────────────────────────────────┐    │ │
│ │  │ IntervalBlock #1 (Warmup) [collapsed]           │    │ │
│ │  │ 🟢 10min @ 60% FTP                    [⋮] [×]   │    │ │
│ │  └─────────────────────────────────────────────────┘    │ │
│ │                                                           │ │
│ │  ┌─────────────────────────────────────────────────┐    │ │
│ │  │ IntervalBlock #2 (Intervals) [expanded] ▼       │    │ │
│ │  │ 5x (15min total)                      [⋮] [×]   │    │ │
│ │  │  ┌───────────────────────────────────────────┐  │    │ │
│ │  │  │ StepBlockMini: Work - 2min @ 95% FTP     │  │    │ │
│ │  │  └───────────────────────────────────────────┘  │    │ │
│ │  │  ┌───────────────────────────────────────────┐  │    │ │
│ │  │  │ StepBlockMini: Rest - 1min @ 50% FTP     │  │    │ │
│ │  │  └───────────────────────────────────────────┘  │    │ │
│ │  └─────────────────────────────────────────────────┘    │ │
│ │                                                           │ │
│ │  [+ Add Interval] [+ From Template]                     │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

Data Flow:
useBuilderState() ← useIntervalBlocks() ← visualBuilderStore
      ↓
IntervalBlock[] (grouped by segmentName)
      ↓
Drag/Drop → reorder → update store → re-render
```

### Quick Start Screen Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ QuickStartScreen (builder/index.tsx)                         │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Header: "Create Workout"                    [Cancel]    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Segmented Control                                        │ │
│ │ [Templates] [Public] [Routes] [Blank]                   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│ Content (based on active tab):                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Templates Tab:                                           │ │
│ │  - Categories: Bike, Run, Swim, Strength                │ │
│ │  - Grid of cards with visual previews (TimelineChart)  │ │
│ │  - Tap card → opens visual builder with template loaded│ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Public Activities Tab:                                   │ │
│ │  - List from trpc.activityPlans.list (samples=true)    │ │
│ │  - Same as Templates but from database                  │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Routes Tab:                                              │ │
│ │  - List from trpc.routes.list                           │ │
│ │  - Shows elevation profiles                             │ │
│ │  - Creates blank workout + attaches route               │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Blank Canvas:                                            │ │
│ │  - Activity type selector (bike/run/swim/etc)           │ │
│ │  - [Start Building] button                              │ │
│ │  → Opens visual builder with empty canvas               │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Navigation Flow

### User Journey Mapping

```
Plan Tab (index.tsx)
    │
    ├─→ [+ Schedule Activity] → ScheduleActivityModal
    │       └─→ "Create New" → Quick Start Screen
    │
    ├─→ Library (library/index.tsx)
    │       └─→ Plan Card → "Open in Visual Builder" option
    │
    └─→ [Floating FAB: Visual Builder] (new addition)
            └─→ Quick Start Screen

Quick Start Screen (plan/builder/index.tsx)
    │
    ├─→ Templates Tab → Select Template → Visual Builder (pre-loaded)
    ├─→ Public Activities Tab → Select Activity → Visual Builder (pre-loaded)
    ├─→ Routes Tab → Select Route → Visual Builder (route attached)
    └─→ Blank Canvas → Select Activity Type → Visual Builder (empty)

Visual Builder (plan/builder/visual/index.tsx)
    │
    ├─→ [Save] → Save to Database → Back to Plan Tab
    ├─→ [Cancel] → Confirm Discard → Back to previous screen
    └─→ [Preview] → Full screen timeline + metrics modal

Backward Compatibility:
- Existing form-based flow (create_activity_plan/index.tsx) remains intact
- Users can toggle between "Form Mode" and "Visual Mode"
- Both flows use same store and save to same V2 schema
```

### Route Definitions

```typescript
// apps/mobile/lib/constants/routes.ts

export const ROUTES = {
  PLAN: {
    // ... existing routes
    
    // NEW: Visual Builder routes
    BUILDER: {
      QUICK_START: "/plan/builder" as const,
      VISUAL: "/plan/builder/visual" as const,
      TEMPLATES: "/plan/builder/templates" as const,
      PUBLIC_ACTIVITIES: "/plan/builder/public/activities" as const,
      PUBLIC_ROUTES: "/plan/builder/public/routes" as const,
    },
    
    // Keep existing for backward compatibility
    CREATE_ACTIVITY_PLAN: {
      INDEX: "/plan/create_activity_plan" as const,
      STRUCTURE: "/plan/create_activity_plan/structure" as const,
      REPEAT: "/plan/create_activity_plan/structure/repeat" as const,
    },
  },
};
```

---

## 4. Visual Design Approach

### Interval Block Design

**Collapsed State:**
```
┌─────────────────────────────────────────────────────────┐
│ 🟢 Warmup                                    [⋮] [×]    │
│ 10min @ 60% FTP                              [Edit]     │
└─────────────────────────────────────────────────────────┘
```

**Expanded State:**
```
┌─────────────────────────────────────────────────────────┐
│ 🟢 Intervals ▼                      5x     [⋮] [×]     │
│ 15min total (3min per cycle)                [Edit]     │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ 🔴 Work - 2min @ 95% FTP           [>] [×]    │    │
│  └────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────┐    │
│  │ 🟢 Rest - 1min @ 50% FTP           [>] [×]    │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  [+ Add Step]                                           │
└─────────────────────────────────────────────────────────┘
```

**Visual Indicators:**
- Color dot (🟢/🟡/🟠/🔴) = Intensity zone (from `getStepIntensityColor`)
- Bar width in timeline = Duration proportion
- Stacked mini bars for interval repeats
- Shadow/elevation for drag state

### Block Interactions

| Gesture | Action |
|---------|--------|
| **Tap block** | Expand/collapse interval |
| **Long press** | Enter drag mode (haptic feedback) |
| **Drag** | Reorder interval in list |
| **Tap [Edit]** | Open detailed editor (sliders) |
| **Tap [×]** | Delete with confirmation |
| **Tap [⋮]** | Context menu (duplicate, rename, etc) |
| **Tap step inside** | Quick edit step |

### Slider-Based Editing

**Duration Slider:**
```
┌─────────────────────────────────────────────────────────┐
│ Duration: 10 minutes                                     │
│ [○────────────────────────────────────────────────────] │
│ 1min                                              2hr   │
│                                                          │
│ Unit: [Seconds] [Minutes] [Hours] [Distance] [Reps]    │
└─────────────────────────────────────────────────────────┘
```

**Intensity Slider:**
```
┌─────────────────────────────────────────────────────────┐
│ Intensity: 85% FTP                                       │
│ [────────────────○────────────────────────────────────] │
│ 50%                                                150%  │
│                                                          │
│ Zone: Z2 (Endurance) 🟢                                 │
└─────────────────────────────────────────────────────────┘
```

**Library to Add:**
```json
// package.json
"dependencies": {
  "@react-native-community/slider": "^4.5.0"
}
```

### Timeline Visualization

**Collapsed (Top of Builder):**
- Horizontal bar showing all intervals
- Proportional widths based on duration
- Color-coded by intensity
- Tappable to scroll to block

**Expanded (Full Preview Modal):**
- Uses existing `TimelineChart` component
- Shows all steps expanded
- Displays total duration, TSS, IF
- Can tap steps to jump to editing

---

## 5. Data Transformation Logic

### Core Challenge: Flat Steps ↔ Visual Intervals

The V2 schema stores steps **flat** with `segmentName` for grouping. The visual builder needs to present them as **intervals** (blocks containing steps).

### Transformation Functions

**File: `apps/mobile/app/(internal)/(tabs)/plan/builder/visual/hooks/useIntervalBlocks.ts`**

```typescript
import { PlanStepV2 } from "@repo/core";
import { groupStepsBySegment } from "@repo/core/schemas/activity_plan_v2";

export interface IntervalBlock {
  id: string; // generated UUID
  segmentName: string;
  repeatCount: number;
  steps: PlanStepV2[]; // Pattern steps (1 cycle)
  expanded: boolean;
  totalDuration: number; // calculated
  color: string; // from first step intensity
}

/**
 * Transform flat V2 steps into visual interval blocks
 */
export function stepsToBlocks(steps: PlanStepV2[]): IntervalBlock[] {
  const segmented = groupStepsBySegment(steps);
  
  return segmented.map((segment) => {
    const firstStep = segment.steps[0];
    const repeatCount = firstStep?.originalRepetitionCount || 1;
    const isInterval = repeatCount > 1;
    
    // If interval, extract pattern (first N steps = 1 cycle)
    const stepsPerCycle = isInterval 
      ? segment.steps.length / repeatCount 
      : segment.steps.length;
    const patternSteps = segment.steps.slice(0, stepsPerCycle);
    
    return {
      id: generateId(),
      segmentName: segment.segmentName,
      repeatCount,
      steps: patternSteps,
      expanded: false,
      totalDuration: calculateDuration(segment.steps),
      color: getStepIntensityColor(patternSteps[0]),
    };
  });
}

/**
 * Transform visual interval blocks back to flat V2 steps
 */
export function blocksToSteps(blocks: IntervalBlock[]): PlanStepV2[] {
  const steps: PlanStepV2[] = [];
  
  for (const block of blocks) {
    if (block.repeatCount === 1) {
      // Non-interval: add steps directly
      steps.push(...block.steps.map(step => ({
        ...step,
        segmentName: block.segmentName,
      })));
    } else {
      // Interval: expand pattern × repeatCount
      for (let i = 0; i < block.repeatCount; i++) {
        for (const step of block.steps) {
          steps.push({
            ...step,
            segmentName: block.segmentName,
            segmentIndex: i,
            originalRepetitionCount: block.repeatCount,
          });
        }
      }
    }
  }
  
  return steps;
}
```

### State Management

**File: `apps/mobile/app/(internal)/(tabs)/plan/builder/store/visualBuilderStore.ts`**

```typescript
import { create } from "zustand";
import { IntervalBlock } from "../visual/hooks/useIntervalBlocks";

interface VisualBuilderState {
  // Form metadata (same as existing store)
  name: string;
  description: string;
  activityCategory: "run" | "bike" | "swim" | "strength" | "other";
  activityLocation: "outdoor" | "indoor";
  routeId: string | null;
  
  // Visual builder specific
  blocks: IntervalBlock[];
  selectedBlockId: string | null;
  isDragging: boolean;
  
  // Actions
  setMetadata: (field: string, value: any) => void;
  setBlocks: (blocks: IntervalBlock[]) => void;
  addBlock: (block: IntervalBlock) => void;
  updateBlock: (id: string, updates: Partial<IntervalBlock>) => void;
  deleteBlock: (id: string) => void;
  reorderBlocks: (blocks: IntervalBlock[]) => void;
  toggleBlockExpanded: (id: string) => void;
  duplicateBlock: (id: string) => void;
  
  // Conversion helpers
  loadFromV2Steps: (steps: PlanStepV2[]) => void;
  exportToV2Steps: () => PlanStepV2[];
  
  reset: () => void;
}

export const useVisualBuilderStore = create<VisualBuilderState>((set, get) => ({
  // ... implementation
}));
```

### Backward Compatibility Strategy

**Two stores working together:**
1. `useActivityPlanCreationStore` - Legacy form mode
2. `useVisualBuilderStore` - New visual mode

**On save:**
- Visual mode: `blocksToSteps()` → save to DB
- Form mode: existing flow (unchanged)

**On edit existing plan:**
- Load V2 steps from DB
- Visual mode: `stepsToBlocks()` → render blocks
- Form mode: existing rendering (unchanged)

---

## 6. Reusable Components Strategy

### Leverage Existing Components

| Existing Component | How to Reuse |
|-------------------|--------------|
| **TimelineChart** | Use as-is for collapsed timeline preview. Add `groupByInterval` prop to show segment boundaries |
| **StepEditorDialog** | Use for detailed step editing. Open when user taps "Edit" on a step block |
| **IntervalWizard** | Reference for slider patterns and validation logic. May extract slider components |
| **StepCard** | Adapt into `StepBlockMini` - smaller, read-only version for inside expanded intervals |
| **SegmentHeader** | Reference for interval header design patterns |

### New Components to Build

**1. IntervalBlock.tsx**
- Collapsed/expanded states
- Drag handle with `GripVertical` icon
- Edit/delete buttons
- Color indicator strip
- Animated expand/collapse

**2. QuickEditSlider.tsx**
- Wraps `@react-native-community/slider`
- Props: `min`, `max`, `value`, `onChange`, `unit`, `label`
- Shows current value as user drags
- Haptic feedback on value change
- Zone indicator for intensity

**3. BuilderCanvas.tsx**
- Uses `DraggableFlatList` (already in package.json)
- Renders `IntervalBlock[]`
- Handles reorder callbacks
- Empty state with "Add Interval" prompt

**4. AddIntervalSheet.tsx**
- Bottom sheet (use `@rn-primitives/dialog` as modal)
- Options: "Blank Interval", "From Template", "Copy Existing"
- Quick interval wizard (work/rest pattern)

---

## 7. Phased Implementation Approach

### Phase 1: MVP (Core Functionality)

**Goal:** Basic visual builder that replaces form-based creation

**Scope:**
1. Quick Start screen with Blank Canvas only
2. Visual Builder canvas with interval blocks (collapsed view)
3. Add/delete/reorder blocks via drag-drop
4. Basic editing: Tap block → opens `StepEditorDialog` for each step
5. Save to database (V2 format)
6. Single activity type (bike workouts only)

**Files to Create (Phase 1):**
- `plan/builder/index.tsx` - Quick Start (Blank Canvas tab only)
- `plan/builder/visual/index.tsx` - Visual Builder screen
- `plan/builder/visual/components/IntervalBlock.tsx`
- `plan/builder/visual/components/BuilderCanvas.tsx`
- `plan/builder/visual/hooks/useIntervalBlocks.ts`
- `plan/builder/store/visualBuilderStore.ts`

**Estimated Effort:** 2-3 days

**Success Criteria:**
- User can create workout with 3+ intervals
- Drag to reorder works smoothly
- Saves to DB and appears in library

---

### Phase 2: Enhanced UX

**Goal:** Add slider-based editing and visual polish

**Scope:**
1. `QuickEditSlider` component for duration/intensity
2. Inline editing (tap block → sliders appear below)
3. Expanded interval view showing steps inside
4. Color-coded blocks and timeline
5. Haptic feedback throughout
6. Animation for expand/collapse

**Files to Create (Phase 2):**
- `plan/builder/visual/components/QuickEditSlider.tsx`
- `plan/builder/visual/components/IntervalBlockExpanded.tsx`
- `plan/builder/visual/components/StepBlockMini.tsx`

**Dependencies:**
- Add `@react-native-community/slider` to package.json

**Estimated Effort:** 2-3 days

**Success Criteria:**
- User can edit duration without opening modal
- Visual feedback feels smooth and responsive
- Intensity changes update colors in real-time

---

### Phase 3: Templates & Discovery

**Goal:** Add Quick Start options (Templates, Public Activities)

**Scope:**
1. Templates tab loading 36 samples
2. Public Activities tab via TRPC
3. Template browser with visual previews
4. Duplicate & edit workflow
5. Category filters (bike/run/swim/etc)

**Files to Create (Phase 3):**
- `plan/builder/templates/index.tsx`
- `plan/builder/public/activities.tsx`
- Enhance `builder/index.tsx` with full tab navigation

**TRPC Queries to Use:**
- `trpc.activityPlans.list({ includeSamples: true })`
- Filter by `activity_category`

**Estimated Effort:** 1-2 days

**Success Criteria:**
- User can browse 36 sample workouts
- Tap template → opens in visual builder (pre-loaded)
- Can modify template and save as new plan

---

### Phase 4: Route Integration

**Goal:** Attach routes to workouts with elevation visualization

**Scope:**
1. Routes tab in Quick Start
2. Route browser with elevation profiles
3. Attach route to workout in visual builder
4. Show elevation inline with workout structure
5. Match workout segments to route segments

**Files to Create (Phase 4):**
- `plan/builder/public/routes.tsx`
- `plan/builder/visual/components/ElevationProfile.tsx`

**TRPC Queries to Use:**
- `trpc.routes.list()`
- Route data includes polylines and elevation

**Estimated Effort:** 2-3 days

**Success Criteria:**
- User can browse routes with elevation previews
- Attach route creates workout with appropriate structure
- Elevation profile visible in builder

---

### Phase 5: Advanced Features (Future)

**Scope:**
1. Undo/redo functionality
2. Block duplication (drag to duplicate)
3. Multi-select for batch operations
4. Workout presets/favorites
5. AI-suggested intervals based on goals
6. Share workout as link/QR code

**Estimated Effort:** 4-5 days (future release)

---

## 8. Technical Decisions & Rationale

### 1. Slider Library Choice

**Decision:** Use `@react-native-community/slider`

**Rationale:**
- Official React Native community package
- Well-maintained and widely used
- Works on iOS and Android
- Supports custom styling and step increments
- Already used in similar fitness apps

**Alternatives Considered:**
- `react-native-slider` - Deprecated
- `@miblanchard/react-native-slider` - More features but heavier

**Implementation Notes:**
- Wrap in custom `QuickEditSlider` for consistent styling
- Add haptic feedback on value changes
- Show current value as user drags (overlay label)

---

### 2. Drag-and-Drop Pattern

**Decision:** Use `react-native-draggable-flatlist` (already in deps)

**Rationale:**
- Already installed and working (`structure/repeat/index.tsx` uses it)
- Smooth animations and gestures
- Supports nested draggable lists
- Works with `GestureHandlerRootView`

**Implementation Pattern:**
```typescript
<DraggableFlatList
  data={blocks}
  renderItem={renderIntervalBlock}
  keyExtractor={(item) => item.id}
  onDragEnd={({ data }) => {
    setBlocks(data);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }}
/>
```

---

### 3. State Management Approach

**Decision:** Zustand store (`visualBuilderStore`) + React hooks

**Rationale:**
- Consistent with existing codebase (already uses `useActivityPlanCreationStore`)
- Lightweight and simple
- No boilerplate like Redux
- Easy to persist to AsyncStorage if needed

**Store Structure:**
- Blocks (visual representation)
- Metadata (name, description, category)
- UI state (expanded blocks, selected block)
- Conversion functions (blocks ↔ steps)

**Hook Pattern:**
```typescript
// Custom hook wraps store logic
function useBuilderState() {
  const store = useVisualBuilderStore();
  const blocks = useIntervalBlocks(store.blocks); // derived state
  
  return {
    blocks,
    addInterval: store.addBlock,
    deleteInterval: store.deleteBlock,
    // ...
  };
}
```

---

### 4. Data Model Adaptation Strategy

**Decision:** Transform on render, save on submit

**Rationale:**
- V2 schema is optimized for storage/recording (flat steps)
- Visual UI needs hierarchical structure (intervals with steps)
- Transform in memory, don't change DB schema
- Two-way transformation functions maintain data integrity

**Flow:**
```
Load Plan from DB (V2 flat steps)
         ↓
   stepsToBlocks() → Visual blocks
         ↓
   User edits blocks
         ↓
   blocksToSteps() → V2 flat steps
         ↓
   Save to DB (unchanged schema)
```

**Edge Cases:**
- Plans without `segmentName` → treat as single block "Main"
- Plans with mixed repeat counts → group by segmentName + repeatCount
- Empty blocks → validate before saving (require ≥1 step)

---

### 5. Backward Compatibility Approach

**Decision:** Keep both flows, add toggle

**Rationale:**
- Don't break existing users' muscle memory
- Form mode may be faster for power users
- Visual mode better for beginners/casual users
- Both save to same V2 format → interchangeable

**Implementation:**
- Add toggle button in `create_activity_plan/index.tsx` header
- "Switch to Visual Builder" / "Switch to Form Mode"
- Store preference in AsyncStorage
- Default to visual for new users, form for existing

---

## 9. Critical Files for Implementation

### 1. `/home/deancochran/GradientPeak/apps/mobile/app/(internal)/(tabs)/plan/builder/visual/index.tsx`
**Reason:** Core visual builder screen - Main canvas where users build workouts

**Key Functionality:**
- Renders `BuilderCanvas` with interval blocks
- Manages toolbar (Save, Cancel, Preview)
- Handles navigation to/from Quick Start
- Orchestrates all child components
- Integrates with `visualBuilderStore`

**Dependencies:**
- `BuilderToolbar`, `BuilderCanvas`, `IntervalBlock`
- `useVisualBuilderStore`, `useIntervalBlocks`
- `TimelineChart` for collapsed preview

---

### 2. `/home/deancochran/GradientPeak/apps/mobile/app/(internal)/(tabs)/plan/builder/visual/hooks/useIntervalBlocks.ts`
**Reason:** Critical data transformation logic - Converts flat steps ↔ visual blocks

**Key Functionality:**
- `stepsToBlocks()` - Load existing plans into visual format
- `blocksToSteps()` - Save visual format to V2 schema
- Handles intervals (repeats) vs single steps
- Maintains segmentName grouping
- Calculates derived data (duration, color)

**Dependencies:**
- `@repo/core/schemas/activity_plan_v2`
- `groupStepsBySegment`, `getStepIntensityColor`

---

### 3. `/home/deancochran/GradientPeak/apps/mobile/app/(internal)/(tabs)/plan/builder/visual/components/IntervalBlock.tsx`
**Reason:** Core UI component - Represents each interval/segment visually

**Key Functionality:**
- Collapsed/expanded states with animation
- Drag handle for reordering
- Color indicator for intensity
- Edit/delete/context menu buttons
- Shows duration, repeat count, step count
- Renders `StepBlockMini` children when expanded

**Design Pattern:**
```typescript
<IntervalBlock
  block={block}
  expanded={block.expanded}
  onToggleExpand={() => toggleExpanded(block.id)}
  onEdit={() => editBlock(block.id)}
  onDelete={() => deleteBlock(block.id)}
  onLongPress={drag} // from DraggableFlatList
  isActive={isDragging}
/>
```

---

### 4. `/home/deancochran/GradientPeak/apps/mobile/app/(internal)/(tabs)/plan/builder/index.tsx`
**Reason:** Entry point for visual builder - Quick Start screen

**Key Functionality:**
- 4 tabs: Templates, Public Activities, Routes, Blank Canvas
- Segmented control navigation
- Template browser with visual previews
- Category filters
- Navigation to visual builder with pre-loaded data

**Integration Points:**
- `trpc.activityPlans.list({ includeSamples: true })`
- `trpc.routes.list()`
- Sample workouts from `@repo/core/samples/v2-samples`

---

### 5. `/home/deancochran/GradientPeak/apps/mobile/components/ActivityPlan/TimelineChart.tsx`
**Reason:** Existing component to enhance - Shows visual workout structure

**Modifications Needed:**
- Add `groupByInterval` prop to show segment boundaries
- Add vertical separators between intervals
- Support tapping segments (not just steps)
- Add "collapsed" mode for builder toolbar

**Current Usage:**
- Already renders flat steps as bars
- Color-coded by intensity
- Proportional widths by duration
- Needs minimal changes to support interval grouping

---

## 10. Implementation Checklist

### Pre-Implementation
- [ ] Review existing `DraggableFlatList` usage in repeat editor
- [ ] Audit `@rn-primitives` components available
- [ ] Test `@react-native-community/slider` in isolation
- [ ] Sketch block UI in design tool (Figma/Sketch)

### Phase 1 (MVP)
- [ ] Create route constants in `routes.ts`
- [ ] Create `visualBuilderStore.ts` with basic state
- [ ] Create `useIntervalBlocks.ts` with transformation functions
- [ ] Write unit tests for `stepsToBlocks()` / `blocksToSteps()`
- [ ] Create `IntervalBlock.tsx` (collapsed view only)
- [ ] Create `BuilderCanvas.tsx` with drag-drop
- [ ] Create Quick Start screen (Blank Canvas tab)
- [ ] Create Visual Builder screen (basic)
- [ ] Add navigation from Plan tab
- [ ] Test save/load workflow
- [ ] Test with existing sample workouts

### Phase 2 (Enhanced UX)
- [ ] Install `@react-native-community/slider`
- [ ] Create `QuickEditSlider.tsx` wrapper
- [ ] Add slider-based editing for duration
- [ ] Add slider-based editing for intensity
- [ ] Implement expanded block view
- [ ] Create `StepBlockMini.tsx`
- [ ] Add animations (expand/collapse)
- [ ] Add haptic feedback throughout
- [ ] Polish colors and spacing
- [ ] Test on iOS and Android

### Phase 3 (Templates)
- [ ] Create Templates browser screen
- [ ] Load 36 samples from `v2-samples.ts`
- [ ] Add visual preview cards (mini TimelineChart)
- [ ] Add category filters
- [ ] Create Public Activities browser
- [ ] Integrate `trpc.activityPlans.list()`
- [ ] Add "Duplicate & Edit" workflow
- [ ] Test template loading performance

### Phase 4 (Routes)
- [ ] Create Routes browser screen
- [ ] Integrate `trpc.routes.list()`
- [ ] Create `ElevationProfile.tsx` component
- [ ] Add route attachment UI in builder
- [ ] Show elevation inline with structure
- [ ] Test route + workout visualization

### Testing & Polish
- [ ] Test with 0 intervals (empty state)
- [ ] Test with 1 interval
- [ ] Test with 10+ intervals (scroll performance)
- [ ] Test drag-drop edge cases
- [ ] Test save/cancel flows
- [ ] Test backward compatibility (load old plans)
- [ ] Add error boundaries
- [ ] Add loading states
- [ ] Add empty states
- [ ] Test on small screens (iPhone SE)
- [ ] Test on tablets (iPad)

---

## 11. Edge Cases & Error Handling

### Data Edge Cases

**1. Plan with no segmentName**
- **Issue:** Old plans may not have `segmentName` set
- **Solution:** Treat as single block named "Main"
- **Implementation:** Default in `stepsToBlocks()`

**2. Mixed repeat counts in same segment**
- **Issue:** Corrupted data or manual DB edits
- **Solution:** Group by `segmentName + originalRepetitionCount`
- **Implementation:** Enhanced grouping logic

**3. Steps with 0 duration**
- **Issue:** Invalid data
- **Solution:** Show validation error, prevent save
- **Implementation:** Validate in `blocksToSteps()`

**4. Empty blocks**
- **Issue:** User deleted all steps in interval
- **Solution:** Auto-delete block or show "Add Step" prompt
- **Implementation:** Check on render

### UI Edge Cases

**1. Long interval names**
- **Solution:** Truncate with ellipsis, show full on long-press
- **Implementation:** `numberOfLines={1}` with tooltip

**2. Many intervals (50+)**
- **Solution:** Virtual scrolling, collapse all by default
- **Implementation:** `FlatList` already virtualizes

**3. Rapid drag operations**
- **Solution:** Debounce save, optimistic updates
- **Implementation:** Store updates immediately, DB save debounced

**4. Network failure on save**
- **Solution:** Show error, offer retry, keep local state
- **Implementation:** TRPC error handling + local storage backup

### User Flow Edge Cases

**1. Back button during edit**
- **Solution:** Confirm discard if changes unsaved
- **Implementation:** Track dirty state in store

**2. App backgrounded during edit**
- **Solution:** Persist to AsyncStorage, restore on resume
- **Implementation:** Zustand persist middleware

**3. Editing plan while scheduled**
- **Solution:** Warn user, offer to reschedule
- **Implementation:** Check `planned_activities` table

---

## 12. Performance Considerations

### Rendering Optimization

**1. Memoize interval blocks**
```typescript
const blocks = useMemo(
  () => stepsToBlocks(steps),
  [steps]
);
```

**2. Virtualize long lists**
- Use `FlatList` for intervals (already virtualizes)
- Lazy-load step details in expanded blocks

**3. Debounce slider changes**
```typescript
const debouncedUpdate = useDebouncedCallback(
  (value) => updateBlock(id, { duration: value }),
  300
);
```

**4. Optimize TimelineChart**
- Render SVG only when visible
- Use `shouldComponentUpdate` for static previews

### State Management

**1. Minimize re-renders**
- Use Zustand selectors: `const blocks = store(s => s.blocks)`
- Split store into slices (metadata, blocks, UI state)

**2. Batch updates**
- Group multiple block changes into single update
- Use `startTransition` for non-urgent updates

---

## 13. Accessibility Considerations

**1. Screen reader support**
- Label all interactive elements
- Announce state changes (expanded/collapsed)
- Describe drag operations

**2. Keyboard navigation**
- Not applicable for mobile, but consider iPad with keyboard

**3. Color contrast**
- Ensure intensity colors meet WCAG AA standards
- Don't rely on color alone (use icons/labels)

**4. Touch targets**
- Minimum 44×44 pt touch areas
- Adequate spacing between buttons

---

## 14. Migration Strategy

### For Existing Users

**1. Gradual rollout**
- Show "Try New Visual Builder" banner in form mode
- Allow toggle between modes
- Track usage analytics

**2. Feature parity**
- Ensure visual mode can do everything form mode can
- Keep form mode for 2+ releases before deprecation

**3. User education**
- In-app tooltip: "Drag to reorder, tap to edit"
- Optional onboarding flow for visual builder
- Help documentation

### For Existing Plans

**1. Automatic migration**
- All existing plans work in visual mode (via transformation)
- No DB migration needed

**2. Segment name backfill**
- Add job to populate `segmentName` for old plans
- Default to "Warmup", "Main", "Cooldown" based on position

---

## 15. Success Metrics

### User Engagement
- % of workouts created in visual mode vs form mode
- Time to create workout (visual vs form)
- Completion rate (start builder → save)

### User Satisfaction
- App Store ratings mentioning "visual builder"
- Support tickets related to workout creation
- Feature request frequency

### Technical Metrics
- Visual builder screen load time (<500ms)
- Drag operation frame rate (60fps)
- Crash rate on builder screens
- V2 data validation pass rate

---

## Appendix A: Code Snippets

### IntervalBlock Component Structure

```typescript
// apps/mobile/app/(internal)/(tabs)/plan/builder/visual/components/IntervalBlock.tsx

interface IntervalBlockProps {
  block: IntervalBlock;
  expanded: boolean;
  isActive: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onLongPress: () => void;
}

export function IntervalBlock({
  block,
  expanded,
  isActive,
  onToggleExpand,
  onEdit,
  onDelete,
  onLongPress,
}: IntervalBlockProps) {
  return (
    <Pressable
      onPress={onToggleExpand}
      onLongPress={onLongPress}
      className={`bg-card border border-border rounded-xl mb-3 ${
        isActive ? 'shadow-lg scale-105' : ''
      }`}
    >
      {/* Header */}
      <View className="flex-row items-center p-4">
        {/* Drag Handle */}
        <Icon as={GripVertical} size={20} className="text-muted-foreground mr-2" />
        
        {/* Color Indicator */}
        <View
          className="w-3 h-3 rounded-full mr-3"
          style={{ backgroundColor: block.color }}
        />
        
        {/* Title & Info */}
        <View className="flex-1">
          <Text className="font-semibold text-base">{block.segmentName}</Text>
          <Text className="text-sm text-muted-foreground">
            {formatDuration(block.totalDuration)}
            {block.repeatCount > 1 && ` × ${block.repeatCount}`}
          </Text>
        </View>
        
        {/* Actions */}
        <Button variant="ghost" size="sm" onPress={onEdit}>
          <Icon as={Edit3} size={16} />
        </Button>
        <Button variant="ghost" size="sm" onPress={onDelete}>
          <Icon as={Trash2} size={16} className="text-destructive" />
        </Button>
      </View>
      
      {/* Expanded Content */}
      {expanded && (
        <View className="px-4 pb-4 border-t border-border pt-3">
          {block.steps.map((step, idx) => (
            <StepBlockMini key={idx} step={step} />
          ))}
          <Button variant="outline" size="sm" className="mt-2">
            <Icon as={Plus} size={14} />
            <Text>Add Step</Text>
          </Button>
        </View>
      )}
    </Pressable>
  );
}
```

### Slider Component

```typescript
// apps/mobile/app/(internal)/(tabs)/plan/builder/visual/components/QuickEditSlider.tsx

import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';

interface QuickEditSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (value: number) => void;
  zoneColor?: string;
}

export function QuickEditSlider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  zoneColor,
}: QuickEditSliderProps) {
  const [localValue, setLocalValue] = useState(value);
  
  const handleValueChange = (newValue: number) => {
    setLocalValue(newValue);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  
  const handleSlidingComplete = (newValue: number) => {
    onChange(newValue);
  };
  
  return (
    <View className="py-4">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-medium">{label}</Text>
        <Text className="text-lg font-semibold">
          {localValue} {unit}
        </Text>
      </View>
      
      <Slider
        value={localValue}
        minimumValue={min}
        maximumValue={max}
        step={step}
        onValueChange={handleValueChange}
        onSlidingComplete={handleSlidingComplete}
        minimumTrackTintColor={zoneColor || '#3B82F6'}
        maximumTrackTintColor="#94A3B8"
        thumbTintColor={zoneColor || '#3B82F6'}
      />
      
      <View className="flex-row justify-between">
        <Text className="text-xs text-muted-foreground">{min}{unit}</Text>
        <Text className="text-xs text-muted-foreground">{max}{unit}</Text>
      </View>
    </View>
  );
}
```

---

## Appendix B: Alternative Designs Considered

### Alternative 1: Step-Based (Not Interval-Based)

**Design:** Drag individual steps, no interval grouping

**Pros:**
- Simpler data model (1:1 with V2 steps)
- No transformation logic needed

**Cons:**
- Cluttered for long workouts (20+ steps)
- Hard to visualize patterns (intervals)
- More scrolling/tapping

**Rejected because:** Users think in intervals ("5×400m"), not individual steps

---

### Alternative 2: Timeline-First (Not Block-First)

**Design:** Main UI is timeline, tap to edit inline

**Pros:**
- More compact view
- Visual duration representation primary

**Cons:**
- Hard to tap small segments on phone
- Limited space for labels/metadata
- Difficult drag interaction on timeline

**Rejected because:** Touch targets too small, less discoverable

---

### Alternative 3: Modal-Based (Not Inline Editing)

**Design:** All editing happens in full-screen modals

**Pros:**
- More space for controls
- Clearer focus

**Cons:**
- More taps/navigation
- Loses context (can't see full workout)
- Feels slower

**Rejected because:** Inline editing is more tactile and immediate

---

## Summary

This implementation plan provides a comprehensive roadmap for building a visual, tactile activity builder that transforms the workout creation experience while leveraging all existing infrastructure. The phased approach ensures rapid delivery of MVP value with clear paths for enhancement.

**Key Success Factors:**
1. Visual blocks make workout structure immediately understandable
2. Drag-and-drop feels natural and fun
3. Slider-based editing is fast and precise
4. Existing V2 data model unchanged (no backend work)
5. Backward compatible with form-based flow
6. Progressive enhancement from MVP → full features

**Next Steps:**
1. Review and approve this plan
2. Begin Phase 1 (MVP) implementation
3. Iterate based on user feedback
4. Roll out phases 2-4 incrementally
