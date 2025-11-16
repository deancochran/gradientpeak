# Activity Plan Creation Flow - Navigation & Architecture

## 📁 File Structure

```
create_activity_plan/
├── index.tsx                    # Main form (entry point)
├── structure/
│   ├── index.tsx               # Structure editor
│   └── repeat/
│       └── index.tsx           # Repeat block editor
└── README.md                   # This file
```

## 🗺️ Navigation Routes

### Registered Routes (in `plan/_layout.tsx`)
```typescript
<Stack.Screen name="create_activity_plan/index" />
<Stack.Screen name="create_activity_plan/structure/index" />
<Stack.Screen name="create_activity_plan/structure/repeat/index" />
```

### Navigation Paths

#### From Plan Index → Create Activity Plan
```typescript
router.push("/(internal)/(tabs)/plan/create_activity_plan");
```

#### From Main Form → Structure Editor
```typescript
router.push({
  pathname: "/(internal)/(tabs)/plan/create_activity_plan/structure/" as any,
});
```

#### From Structure → Repeat Editor (New)
```typescript
router.push({
  pathname: "/(internal)/(tabs)/plan/create_activity_plan/structure/repeat/" as any,
  params: {
    repeatIndex: steps.length.toString(),
  },
});
```

#### From Structure → Repeat Editor (Edit)
```typescript
router.push({
  pathname: "/(internal)/(tabs)/plan/create_activity_plan/structure/repeat/" as any,
  params: {
    repeatIndex: index.toString(),
  },
});
```

#### Back Navigation
```typescript
router.back(); // All pages use this
```

## 🏗️ Architecture: Zustand State Management

### Store Location
`apps/mobile/lib/stores/activityPlanCreation.ts`

### Why Zustand?
This multi-page form uses **Zustand** for global state management to solve the architectural challenge of reactive updates across navigation:

- ✅ Changes in sub-pages immediately update the main form
- ✅ No complex navigation params for data passing
- ✅ Form state persists across navigation
- ✅ Clean separation of concerns
- ✅ Full TypeScript support

### Store State
```typescript
interface ActivityPlanCreationState {
  name: string;
  description: string;
  activityType: string;
  structure: { steps: StepOrRepetition[] };
  
  // Actions
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  setActivityType: (type: string) => void;
  setStructure: (structure: { steps: StepOrRepetition[] }) => void;
  updateStep: (index: number, step: StepOrRepetition) => void;
  addStep: (step: Step) => void;
  addRepeat: (repeat: StepOrRepetition) => void;
  removeStep: (index: number) => void;
  reorderSteps: (steps: StepOrRepetition[]) => void;
  updateRepeatAtIndex: (index: number, repeat: StepOrRepetition) => void;
  reset: () => void;
}
```

### Usage in Components
```typescript
// Import the store
import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";

// In component
const { name, structure, setName, addStep, reset } = useActivityPlanCreationStore();
```

## 🔄 Data Flow

```
┌─────────────────┐
│   Main Form     │
│  (index.tsx)    │
│                 │
│  - Reads store  │
│  - Displays     │
│    timeline     │
│  - Shows metrics│
└────────┬────────┘
         │
         │ Navigate to structure
         ▼
┌─────────────────┐
│ Structure Page  │
│(structure/index)│
│                 │
│  - Edits store  │
│  - Add/remove   │
│    steps        │
└────────┬────────┘
         │
         │ Navigate to repeat
         ▼
┌─────────────────┐
│  Repeat Page    │
│(repeat/index)   │
│                 │
│  - Edits repeat │
│  - Updates store│
└─────────────────┘
         │
         │ All pages update
         ▼
┌─────────────────┐
│  Zustand Store  │
│                 │
│  Central source │
│  of truth       │
└─────────────────┘
```

## 📋 Page Responsibilities

### Main Form (`index.tsx`)
- **Purpose**: Entry point for creating activity plan
- **Features**:
  - Compact form layout (no scrolling)
  - Activity type icon dropdown
  - Name and description inputs
  - Combined metrics + timeline card
  - Reactive to structure changes
- **State**: Reads from Zustand store
- **Navigation**: Can navigate to structure page

### Structure Page (`structure/index.tsx`)
- **Purpose**: Edit the activity structure (steps and repeats)
- **Features**:
  - Minimal header with back and + buttons
  - Horizontal static timeline
  - Draggable/scrollable step list
  - Add menu for step or repeat
  - Auto-save to store
- **State**: Reads and writes to Zustand store
- **Navigation**: Can navigate to repeat page with index param

### Repeat Page (`structure/repeat/index.tsx`)
- **Purpose**: Edit a repeat block
- **Features**:
  - Minimal header with back and + step buttons
  - Repeat count input
  - Timeline for repeated steps only
  - Draggable step list
  - Auto-save to store
- **State**: Reads and writes to Zustand store
- **Navigation**: Returns to structure page on back
- **Params**: 
  - `repeatIndex`: Index of repeat in structure (for new or existing)

## 🚀 Production Checklist

### ✅ Navigation
- [x] All routes registered in `_layout.tsx`
- [x] All navigation paths use full pathnames
- [x] All headers hidden (custom headers implemented)
- [x] Back navigation works correctly
- [x] Navigation params properly typed

### ✅ State Management
- [x] Zustand store created and configured
- [x] All pages use the store
- [x] Reactive updates work across pages
- [x] Store resets on cancel/save
- [x] No race conditions

### ✅ UI/UX
- [x] Main form is compact (no scrolling)
- [x] Activity type icon dropdown
- [x] Metrics displayed minimally
- [x] Timeline is reactive
- [x] Structure page is minimal
- [x] Repeat page is minimal
- [x] All custom headers implemented

### ✅ Data Integrity
- [x] Form validation on submit
- [x] Calculated fields are read-only
- [x] Auto-save works correctly
- [x] No data loss on navigation
- [x] Proper cleanup on unmount

## 🐛 Common Issues & Solutions

### Issue: Changes not reflecting in main form
**Solution**: Ensure all pages are using `useActivityPlanCreationStore()` and not local state.

### Issue: Navigation not working
**Solution**: 
1. Check route is registered in `_layout.tsx`
2. Use full pathname: `"/(internal)/(tabs)/plan/create_activity_plan/..."`
3. Use object syntax: `router.push({ pathname: "..." as any })`

### Issue: Repeat page showing wrong data
**Solution**: Ensure `repeatIndex` param is passed correctly and parsed as integer.

### Issue: Store not resetting
**Solution**: Call `reset()` in cleanup effects and after save/cancel actions.

## 📝 Future Enhancements

- [ ] Add copy/duplicate functionality
- [ ] Add loading states for async operations

## 🔗 Related Files

- Store: `apps/mobile/lib/stores/activityPlanCreation.ts`
- Layout: `apps/mobile/app/(internal)/(tabs)/plan/_layout.tsx`
- Components: `apps/mobile/components/ActivityPlan/`
- Types: `packages/core/src/types/`

## 📚 References

- [Expo Router Docs](https://docs.expo.dev/router/introduction/)
- [Zustand Docs](https://zustand-demo.pmnd.rs/)
- [React Native Navigation Patterns](https://reactnavigation.org/docs/navigating/)
