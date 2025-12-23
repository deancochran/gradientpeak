# Plan Tab Consolidation - Single Screen Design

## Executive Summary

This document proposes consolidating the Plan tab from 4 separate pages into **one unified screen** with modal-based interactions. The goal is to create a minimal, understandable view that maintains all functionality while reducing navigation complexity.

---

## Current Structure (4 Pages)

### 1. **`/plan/index.tsx`** - Main Plan Screen
- **Purpose**: Weekly calendar view, today's activities, quick stats
- **Features**:
  - Week calendar with activity indicators
  - Selected day activities list
  - Upcoming activities preview (3 items)
  - Plan progress card
  - Adherence rate & weekly scheduled count
  - Quick action cards (Routes, Library, Create Activity)

### 2. **`/plan/training-plan/index.tsx`** - Training Plan Overview
- **Purpose**: Deep dive into training plan metrics and progress
- **Features**:
  - CTL/ATL/TSB metrics (Current Status)
  - Weekly progress (completed TSS vs planned TSS)
  - Upcoming activities list (unlimited)
  - Plan progress (current week / total weeks)
  - Plan details (weekly TSS target, activities per week, rest days)
  - Action buttons (View Calendar, View Trends)

### 3. **`/plan/planned_activities/index.tsx`** - All Scheduled Activities
- **Purpose**: Comprehensive list of all scheduled activities
- **Features**:
  - Activity count header
  - Grouped activity list (by date)
  - FAB button to schedule new activity
  - Empty state with library CTA

### 4. **`/plan/create_planned_activity/index.tsx`** - Schedule Activity Form
- **Purpose**: Schedule or edit a planned activity
- **Features**:
  - Activity plan selector (horizontal scroll)
  - Create new plan button
  - Selected plan preview card
  - Date picker
  - Notes textarea
  - Submit/update button

---

## Proposed Consolidated Structure (1 Page + Modals)

### **Single Screen: `/plan/index.tsx`**

The new unified plan screen combines the best elements from all four pages into a single, scrollable view with clear sections.

---

## Screen Layout (Top to Bottom)

### **1. Header Section**
```
┌─────────────────────────────────────────┐
│  Plan          [Settings] [Calendar]    │
│  Adherence: 85% • 5 Scheduled This Week │
└─────────────────────────────────────────┘
```
- **Adherence rate** and **weekly scheduled count** (from current plan/index)
- **Settings icon** → Opens Training Plan Settings Modal
- **Calendar icon** → Opens Calendar View Modal (replaces /planned_activities)

---

### **2. Training Status Card** (Expandable)
```
┌─────────────────────────────────────────┐
│  Training Readiness           [Expand ▼]│
│                                          │
│  Fitness    Fatigue    Form             │
│    42         38       +4                │
│   Steady     Tired    Prime              │
│                                          │
│  [View Detailed Trends →]               │
└─────────────────────────────────────────┘
```
- **Collapsed**: Shows CTL, ATL, TSB with status labels
- **Expanded**: Adds weekly progress bar (TSS completed/planned/target)
- **Tap "View Trends"** → Navigate to `/trends` tab
- **Source**: Combines CurrentStatusCard + WeeklyProgressCard from training-plan/index

---

### **3. Week Calendar** (Existing)
```
┌─────────────────────────────────────────┐
│  ← Mon Tue Wed Thu Fri Sat Sun →       │
│     16  17  18  19  20  21  22         │
│     🟢  🟢  ⚪  🔵  ⚪  🟡  ⚪         │
└─────────────────────────────────────────┘
```
- Keep existing week calendar exactly as is
- Dots indicate activity type and completion status
- Tap day to select and show activities below

---

### **4. Selected Day Activities**
```
┌─────────────────────────────────────────┐
│  Today • Thursday, Dec 22               │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ 🏃 Morning Easy Run                │ │
│  │ 45 min • 50 TSS                    │ │
│  │ [Start Activity]                   │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ 🚴 Evening Bike Workout            │ │
│  │ 60 min • 75 TSS                    │ │
│  │ Completed ✓                        │ │
│  └────────────────────────────────────┘ │
│                                          │
│  [+ Schedule New Activity]              │
└─────────────────────────────────────────┘
```
- Keep existing day activity list
- Tap activity card → Opens **Activity Detail Modal**
- Tap "+ Schedule" → Opens **Schedule Activity Modal**

---

### **5. Upcoming Activities** (Compact)
```
┌─────────────────────────────────────────┐
│  Next Up                    [View All →]│
│                                          │
│  Fri, Dec 23 • Tempo Run • 60 min      │
│  Sat, Dec 24 • Long Ride • 180 min     │
│  Sun, Dec 25 • Recovery Run • 30 min   │
└─────────────────────────────────────────┘
```
- Shows next 3 upcoming activities (like current plan/index)
- Tap activity → Opens **Activity Detail Modal**
- Tap "View All" → Opens **All Activities Modal** (calendar view)

---

### **6. Training Plan Progress Card**
```
┌─────────────────────────────────────────┐
│  Marathon Training Plan                 │
│  Week 8/16 • 50% Complete               │
│  ████████████░░░░░░░░░░░░              │
│                                          │
│  Weekly TSS Target: 350-450             │
│  Activities per Week: 5                 │
│                                          │
│  [View Full Plan Details]               │
└─────────────────────────────────────────┘
```
- Combines plan progress + plan details from training-plan/index
- Tap card → Opens **Plan Details Modal** (full training-plan/index content)
- Shows current week, progress bar, key metrics

---

### **7. Quick Actions** (Existing)
```
┌─────────────────────────────────────────┐
│  📍 Routes                          >   │
│  📚 Activity Library                 >   │
│  ➕ Create Custom Activity           >   │
└─────────────────────────────────────────┘
```
- Keep as-is from current plan/index

---

## Modal Components

### **Modal 1: Activity Detail Modal** (Already Exists ✓)
**File**: `PlannedActivityDetailModal.tsx`
- Shows full activity details (already implemented)
- Actions: Start, Reschedule, Delete

---

### **Modal 2: Schedule Activity Modal** (NEW)
**Replaces**: `/plan/create_planned_activity/index.tsx`
- **Trigger**: Tap "+ Schedule New Activity" or "Reschedule"
- **Content**: 
  - Activity plan selector (horizontal scroll)
  - Create new plan button
  - Date picker
  - Notes textarea
  - Submit button
- **Implementation**: Convert create_planned_activity/index.tsx to modal component

---

### **Modal 3: All Activities Calendar Modal** (NEW)
**Replaces**: `/plan/planned_activities/index.tsx`
- **Trigger**: Tap "View All" on Upcoming Activities or Calendar icon in header
- **Content**:
  - Full-screen modal with month/week calendar view
  - Activity count header
  - Grouped activity list (by date)
  - Pull to refresh
- **Implementation**: Convert planned_activities/index.tsx to modal component

---

### **Modal 4: Plan Details Modal** (NEW)
**Replaces**: `/plan/training-plan/index.tsx`
- **Trigger**: Tap Training Plan Progress Card or "View Full Plan Details"
- **Content**:
  - Detailed CTL/ATL/TSB charts (could add graphs later)
  - Weekly progress breakdown
  - Full upcoming activities list (not just 3)
  - Plan structure details (TSS ranges, activity frequency, rest days)
  - Action buttons (View Calendar, View Trends, Settings)
- **Implementation**: Convert training-plan/index.tsx to modal component

---

## Information Architecture Comparison

### Before (4 Pages)
```
/plan
├── /training-plan          → Training metrics + plan details
├── /planned_activities     → All scheduled activities list
└── /create_planned_activity → Schedule/edit form
```

### After (1 Page + 4 Modals)
```
/plan (unified screen)
├── Activity Detail Modal (existing)
├── Schedule Activity Modal (new)
├── All Activities Modal (new)
└── Plan Details Modal (new)
```

---

## User Flow Examples

### **Flow 1: View Training Plan Metrics**
**Before**: Home → Plan Tab → Tap "Training Plan" card → training-plan/index
**After**: Home → Plan Tab → Expand "Training Readiness" card (in-place)
**Deep Dive**: Tap "View Full Plan Details" → Plan Details Modal

---

### **Flow 2: Schedule New Activity**
**Before**: Home → Plan Tab → Tap "+ Schedule Activity" → create_planned_activity/index
**After**: Home → Plan Tab → Tap "+ Schedule New Activity" → Schedule Activity Modal

---

### **Flow 3: View All Scheduled Activities**
**Before**: Home → Plan Tab → Tap "View All" or calendar icon → planned_activities/index
**After**: Home → Plan Tab → Tap "View All" or calendar icon → All Activities Modal

---

### **Flow 4: Start Today's Activity**
**Before**: Home → Plan Tab → Select today → Tap activity → Modal → Start
**After**: **SAME** (no change, works perfectly)

---

## Benefits of Consolidation

### ✅ **Reduced Navigation Complexity**
- 75% fewer dedicated pages (4 → 1)
- No deep navigation stacks
- Modal-based interactions feel lighter and faster

### ✅ **Improved Context Awareness**
- User stays on main plan screen
- Can see calendar + metrics + upcoming activities simultaneously
- No context switching between pages

### ✅ **Faster Access to Information**
- Training metrics visible immediately (expandable card)
- Upcoming activities always visible (top 3)
- One tap to see full details (modals)

### ✅ **Better Mobile UX**
- Modals are native to mobile interaction patterns
- Easier to dismiss and return to main view
- Less back-button confusion

### ✅ **Maintainability**
- Single source of truth for plan screen
- Modals are self-contained components
- Easier to test and debug

---

## Implementation Plan

### **Phase 1: Create Modal Components**
1. **Schedule Activity Modal** (`ScheduleActivityModal.tsx`)
   - Copy content from create_planned_activity/index.tsx
   - Wrap in `<Modal>` component
   - Update to accept `isVisible`, `onClose`, `activityId` props

2. **All Activities Modal** (`AllActivitiesModal.tsx`)
   - Copy content from planned_activities/index.tsx
   - Wrap in `<Modal>` component
   - Update to accept `isVisible`, `onClose` props

3. **Plan Details Modal** (`PlanDetailsModal.tsx`)
   - Copy content from training-plan/index.tsx
   - Wrap in `<Modal>` component
   - Update to accept `isVisible`, `onClose` props

---

### **Phase 2: Update Main Plan Screen**
1. **Add Training Status Expandable Card**
   - Import CurrentStatusCard + WeeklyProgressCard components
   - Add expand/collapse state
   - Show CTL/ATL/TSB when collapsed, add weekly progress when expanded

2. **Add Modal Triggers**
   - Add state management for modal visibility
   - Add header calendar icon → opens All Activities Modal
   - Add "View All" button on Upcoming Activities → opens All Activities Modal
   - Add "+ Schedule" button → opens Schedule Activity Modal
   - Add tap handler on Plan Progress Card → opens Plan Details Modal

3. **Integrate Plan Progress Card**
   - Move plan progress card from middle to dedicated section
   - Add plan details (TSS targets, frequency, rest days) directly in card
   - Make entire card tappable → opens Plan Details Modal

---

### **Phase 3: Remove Old Pages**
1. Delete `/plan/training-plan/` directory (except reusable components)
2. Delete `/plan/planned_activities/` directory (except ActivityList component)
3. Delete `/plan/create_planned_activity/` directory
4. Update router navigation calls to use modals instead

---

### **Phase 4: Polish & Test**
1. Add smooth modal animations (slide up, fade in)
2. Test all user flows end-to-end
3. Verify data refresh works correctly in modals
4. Test on different screen sizes
5. Add loading skeletons for modal content

---

## Technical Considerations

### **1. State Management**
```typescript
const [showScheduleModal, setShowScheduleModal] = useState(false);
const [showAllActivitiesModal, setShowAllActivitiesModal] = useState(false);
const [showPlanDetailsModal, setShowPlanDetailsModal] = useState(false);
const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
```

### **2. Modal Component Pattern**
```typescript
interface ModalProps {
  isVisible: boolean;
  onClose: () => void;
  // Additional props as needed
}

export function MyModal({ isVisible, onClose, ...props }: ModalProps) {
  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* Modal content */}
    </Modal>
  );
}
```

### **3. Data Refresh Strategy**
- Use TRPC's `utils.invalidate()` after mutations
- Modals should trigger parent screen refresh on close
- Pull-to-refresh on main screen invalidates all queries

### **4. Navigation Params**
- Keep support for deep linking (e.g., `?activityId=xxx`)
- useEffect to open correct modal based on URL params

---

## Open Questions

1. **Training Status Card**: Should it be expandable or always show full details?
   - **Recommendation**: Start collapsed (CTL/ATL/TSB only), expand to show weekly progress

2. **All Activities Modal**: Calendar view or list view?
   - **Recommendation**: Start with list view (grouped by date), add calendar toggle later

3. **Plan Details Modal**: Should it include charts/graphs?
   - **Recommendation**: Start with text metrics, add charts in Phase 2

4. **FAB Button**: Keep on main screen for quick scheduling?
   - **Recommendation**: No, use "+ Schedule" button in selected day section instead

---

## Mobile UI/UX Best Practices Applied

### **✅ Progressive Disclosure**
- Show most important info first (today's activities, next 3 upcoming)
- Details hidden in modals until needed

### **✅ Minimize Cognitive Load**
- One primary screen with clear sections
- Modals for focused tasks (scheduling, viewing details)

### **✅ Reduce Navigation Depth**
- Maximum 2 levels deep (screen → modal)
- Modal dismissal returns to exact same screen state

### **✅ Contextual Actions**
- Actions appear where they're needed (schedule button in day section)
- Quick actions at bottom for less common tasks

### **✅ Visual Hierarchy**
- Header stats → Training metrics → Calendar → Today → Upcoming → Plan
- Most time-sensitive info at top

---

## Wireframe (Text-Based)

```
┌────────────────────────────────────────────┐
│ ◀  Plan         [⚙️ Settings] [📅 Calendar] │ ← Header with modals
├────────────────────────────────────────────┤
│ 85% Adherence • 5 Scheduled This Week      │ ← Key Stats
├────────────────────────────────────────────┤
│                                             │
│ Training Readiness              [Expand ▼] │ ← Expandable Card
│ Fitness: 42 (Steady) | Fatigue: 38 (Tired) │
│ Form: +4 (Prime)                           │
│ [View Detailed Trends →]                   │
│                                             │
├────────────────────────────────────────────┤
│  ← Mon Tue Wed Thu Fri Sat Sun →          │ ← Week Calendar
│     16  17  18 [19] 20  21  22            │
│     🟢  🟢  ⚪  🔵  ⚪  🟡  ⚪            │
├────────────────────────────────────────────┤
│                                             │
│ Today • Thursday, Dec 19                   │ ← Selected Day
│                                             │
│ ┌─────────────────────────────────────┐   │
│ │ 🏃 Morning Easy Run                 │   │
│ │ 45 min • 50 TSS                     │   │
│ │ [Start Activity]                    │   │
│ └─────────────────────────────────────┘   │
│                                             │
│ [+ Schedule New Activity]                  │ ← Opens modal
│                                             │
├────────────────────────────────────────────┤
│                                             │
│ Next Up                      [View All →]  │ ← Opens modal
│                                             │
│ • Fri, Dec 20 - Tempo Run - 60 min        │
│ • Sat, Dec 21 - Long Ride - 180 min       │
│ • Sun, Dec 22 - Recovery Run - 30 min     │
│                                             │
├────────────────────────────────────────────┤
│                                             │
│ Marathon Training Plan                     │ ← Tap to open modal
│ Week 8/16 • 50% Complete                   │
│ ████████████░░░░░░░░░░░░                  │
│                                             │
│ Weekly TSS: 350-450 • 5 Activities/Week    │
│                                             │
├────────────────────────────────────────────┤
│                                             │
│ 📍 Routes                              >   │
│ 📚 Activity Library                     >   │
│ ➕ Create Custom Activity               >   │
│                                             │
└────────────────────────────────────────────┘
```

---

## Success Metrics

After implementation, track:
- **Time to complete common tasks** (should decrease)
- **User confusion reports** (should decrease)
- **Modal dismissal rate** (should be high, indicating users find what they need)
- **Navigation depth analytics** (should be lower)

---

## Conclusion

This consolidation transforms the Plan tab from a fragmented multi-page experience into a **single, coherent screen** that surfaces the most important information while keeping detailed views easily accessible through modals.

**Key Principle**: *Everything visible, details on-demand.*

The user can see their weekly calendar, today's activities, upcoming workouts, and training metrics all at once—without navigating away from the main screen. When they need more details, a single tap opens a focused modal with comprehensive information.

This design aligns with modern mobile UX patterns (Instagram, Twitter, Strava all use this approach) and significantly reduces cognitive load while maintaining full functionality.

---

## Next Steps

1. **Review this document** with the team
2. **Validate assumptions** with user testing (if possible)
3. **Prioritize implementation phases** (can roll out incrementally)
4. **Create component stubs** for new modals
5. **Begin Phase 1: Modal Components**

Let me know if you'd like me to start implementing this design!
