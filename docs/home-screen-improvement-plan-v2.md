# GradientPeak Home Screen Implementation Plan - Customized for Your App

## 🎯 Overview
This plan adapts the external UI mockup to fit GradientPeak's existing architecture, theme system, and component library. We'll enhance the home screen WITHOUT discarding your current theme or creating custom styling from scratch.

---

## 📊 Component Inventory: What You Have vs What You Need

### ✅ **Components You Already Have** (Keep & Enhance)
| Component | Location | Status | Action |
|-----------|----------|--------|--------|
| `TodaysFocusCard` | `components/home/` | ✅ Good foundation | **Enhance**: Add rest day state variant |
| `TrainingFormCard` | `components/home/` | ✅ Has CTL/ATL/TSB | **Transform**: Add circular gauge visualization |
| `StatCard` | `components/home/` | ✅ Reusable | **Keep**: Works well as-is |
| `WeeklyPlanPreview` | `components/home/` | ✅ Good structure | **Keep**: Already matches target design |
| `WeeklyGoalCard` | `components/home/` | ✅ Has progress bar | **Enhance**: Add visual bar chart |
| `QuickActions` | `components/home/` | ✅ Functional | **Keep or simplify** |
| `EmptyState` | `components/home/` | ✅ Good UX | **Keep**: Unchanged |
| Card/Button/Text | `components/ui/` | ✅ 34 components | **Use**: Leverage existing UI library |

### 🆕 **New Components Needed** (Build from Scratch)
| Component | Purpose | Complexity |
|-----------|---------|------------|
| `TrainingReadinessGauge` | Circular progress gauge (hero element) | Medium - needs SVG |
| `PlanProgressBar` | Segmented week timeline | Low - simple Views |
| `RestDayCard` | Alternative to TodaysFocusCard | Low - text & styling |

### 🔄 **Components to Enhance** (Modify Existing)
1. **TodaysFocusCard** → Add rest day detection and alternate UI
2. **TrainingFormCard** → Add circular gauge option (or create separate component)
3. **WeeklyGoalCard** → Add horizontal bar visualization

---

## 🎨 Theme Strategy: Work WITH Your Existing System's Theme

**Recommendation**: Keep your existing theme. The target mockup's pure black is a stylistic choice, not a requirement.

---

## 🏗️ Implementation Plan: Component-by-Component

### Phase 1: Add Circular Training Readiness Gauge (NEW)

**File**: `apps/mobile/components/home/TrainingReadinessCard.tsx`

**What to Build**:
- Large circular SVG gauge (200px diameter)
- Animated arc showing 0-100% readiness
- Center text: percentage + status ("92% - Prime")
- Bottom metrics: CTL, ATL, TSB with color-coded status

**Dependencies**: Already installed ✅
- `react-native-svg` - ✅ Installed
- `react-native-reanimated` - ✅ Installed

**Integration Point**: Replace or enhance existing `TrainingFormCard`

**Data Source**: Enhance `useHomeData` hook to calculate:
```typescript
trainingReadiness: {
  percentage: number,      // 0-100 (calculated from TSB + CTL)
  status: string,          // "Prime", "Good", "Moderate", "Fatigued"
  ctl: number,             // Existing
  ctlStatus: string,       // "Rising", "Steady", "Dropping"
  atl: number,             // Existing  
  atlStatus: string,       // "High", "Moderate", "Low"
  tsb: number,             // Existing
  tsbStatus: string,       // "Fresh", "Neutral", "Tired"
}
```

**Visual Specs**:
- Use your existing Card component as wrapper
- Arc color: `text-green-500` (or `success` from your theme)
- Background arc: `bg-muted` or `bg-card`
- Center text: `text-6xl font-bold` (Tailwind classes you already have)

---

### Phase 2: Enhance TodaysFocusCard (MODIFY EXISTING)

**File**: `apps/mobile/components/home/TodaysFocusCard.tsx`

**Current State**: Shows activity OR "No activity scheduled"
**Target State**: Shows workout details OR dedicated rest day message

**Changes Needed**:

1. **Detect rest day** (not just null activity):
```typescript
// In your useHomeData hook or component
const isRestDay = !todaysActivity || todaysActivity.type === 'rest' || todaysActivity.title?.toLowerCase().includes('rest');
```

2. **Update rest day UI**:
```typescript
// Current: Generic "no activity" card
// New: Motivational rest day card

if (isRestDay) {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <Text className="text-muted-foreground text-sm">Today's Training</Text>
      </CardHeader>
      <CardContent>
        <Text className="text-foreground text-2xl font-bold mb-2">
          Rest Day
        </Text>
        <Text className="text-muted-foreground text-sm leading-relaxed">
          Active recovery. Focus on hydration and mobility. Your body is building fitness.
        </Text>
      </CardContent>
    </Card>
  );
}
```

**Keep Everything Else**: Your current gradient card for workouts is already excellent!

---

### Phase 3: Add Plan Progress Bar (NEW - OPTIONAL)

**File**: `apps/mobile/components/home/PlanProgressCard.tsx`

**Purpose**: Visual timeline showing weeks in training plan

**When to Build**: Only if you have training plan data with:
- Event name
- Total weeks
- Weeks completed
- Target date

**Implementation**:
```typescript
export function PlanProgressCard({ plan }) {
  return (
    <Card>
      <CardContent className="p-4">
        <Text className="text-foreground font-semibold mb-2">
          {plan.name}
        </Text>
        
        {/* Horizontal segmented progress bar */}
        <View className="flex-row gap-0.5 mb-2">
          {Array.from({ length: plan.totalWeeks }).map((_, i) => (
            <View
              key={i}
              className={`flex-1 h-1.5 rounded-sm ${
                i < plan.weeksCompleted ? 'bg-muted-foreground' : 'bg-muted'
              }`}
            />
          ))}
        </View>
        
        <Text className="text-muted-foreground text-sm">
          {plan.weeksRemaining} Weeks Out • {plan.eventDate}
        </Text>
      </CardContent>
    </Card>
  );
}
```

**Skip if**: You don't currently track training plans with week-by-week structure

---

### Phase 4: Enhance Weekly Stats Visualization (MODIFY EXISTING)

**File**: `apps/mobile/components/home/WeeklyGoalCard.tsx` (or create new)

**Current**: Three separate StatCards + WeeklyGoalCard
**Target**: Single card with horizontal bar chart showing daily completion

**Option A - Minimal Change**:
Add small bar chart to existing WeeklyGoalCard:

```typescript
// Add to WeeklyGoalCard.tsx
<View className="flex-row gap-1 mt-3">
  {Array.from({ length: 7 }).map((_, i) => (
    <View
      key={i}
      className={`flex-1 h-8 rounded-sm ${
        i < weeklyStats.completedDays ? 'bg-muted-foreground' : 'bg-muted'
      }`}
    />
  ))}
</View>
```

**Option B - Full Redesign**:
Create new `WeeklySnapshotCard` combining stats + visualization (see full code in original plan)

---

### Phase 5: Update Home Screen Layout (MODIFY)

**File**: `apps/mobile/app/(internal)/(tabs)/index.tsx`

**Current Order**:
1. Header (greeting + avatar)
2. TodaysFocusCard
3. StatCard grid (3 cards)
4. TrainingFormCard
5. WeeklyPlanPreview
6. WeeklyGoalCard
7. QuickActions

**Recommended New Order**:
1. Header (greeting + avatar) - **Keep as-is** ✅
2. PlanProgressCard (NEW - if applicable)
3. TodaysFocusCard (enhanced with rest day) - **Modified** 🔄
4. TrainingReadinessCard (NEW - hero component) - **New** 🆕
5. WeeklyPlanPreview - **Keep as-is** ✅
6. WeeklySnapshotCard OR keep StatCards + WeeklyGoalCard - **Choose one** 🔀
7. QuickActions - **Keep as-is** ✅

---

## 📋 Step-by-Step Implementation Checklist

### Week 1: Foundation & Hero Component

- [ ] **Task 1.1**: Add calculation for training readiness percentage in `useHomeData` hook
  - Formula: `percentage = Math.min(100, Math.max(0, 50 + (tsb * 2) + (ctl / 2)))`
  - Add status labels based on percentage ranges
  
- [ ] **Task 1.2**: Create `TrainingReadinessCard.tsx` component
  - Build circular SVG gauge using `react-native-svg`
  - Add Reanimated animation for arc drawing
  - Display CTL/ATL/TSB metrics at bottom
  - Use existing Card, Text components from `components/ui/`
  
- [ ] **Task 1.3**: Add rest day detection to `TodaysFocusCard`
  - Check if activity is null or type === 'rest'
  - Add alternate UI for rest days
  - Keep existing workout card UI

- [ ] **Task 1.4**: Integrate TrainingReadinessCard into home screen
  - Add import to `index.tsx`
  - Position below TodaysFocusCard
  - Test with real data

### Week 2: Supporting Components & Polish

- [ ] **Task 2.1**: (Optional) Create `PlanProgressCard.tsx` if you have plan data
  - Only build if training plans have week-by-week structure
  - Use segmented progress bar visualization
  
- [ ] **Task 2.2**: Enhance weekly stats visualization
  - Choose Option A (minimal) or Option B (full redesign)
  - Add horizontal bar chart for daily completion
  
- [ ] **Task 2.3**: Update layout in `index.tsx`
  - Reorder components based on new hierarchy
  - Remove any redundant cards
  
- [ ] **Task 2.4**: Add entrance animations (optional)
  - Use existing Reanimated installation
  - Stagger card fade-ins
  
- [ ] **Task 2.5**: Testing & refinement
  - Test on iPhone and Android
  - Test with various data states (no data, rest day, workout day)
  - Verify loading states work
  - Test pull-to-refresh

---

## 🎨 Styling Guide: Use Your Existing Theme

### DO Use Your Existing Classes ✅
```typescript
// Background
className="bg-background"      // Your main background
className="bg-card"            // Card backgrounds
className="bg-muted"           // Subtle elements

// Text
className="text-foreground"         // Primary text
className="text-muted-foreground"   // Secondary text
className="text-card-foreground"    // Text on cards

// Spacing (already consistent)
className="p-4"    // Card padding
className="gap-4"  // Between cards
className="mb-4"   // Card margins

// Your existing gradients (TodaysFocusCard)
className="from-indigo-600 to-purple-600"  // Keep this!
```

### DON'T Create New Colors ❌
```typescript
// ❌ Don't do this - uses hardcoded colors
className="bg-[#1C1C1E]"

// ✅ Do this instead - uses your theme
className="bg-card"
```

### Color Status Mappings (Use What You Have)
```typescript
// For metric status indicators
const statusColors = {
  fresh: 'text-green-500',      // or text-success if you add it
  steady: 'text-muted-foreground',
  dropping: 'text-orange-500',  // or text-warning
  critical: 'text-destructive',
};
```

---

## 💾 Data Requirements

### Existing Data (You Already Have) ✅
From `useHomeData` hook:
- ✅ `todaysActivity` - for TodaysFocusCard
- ✅ `weeklyStats` (volume, activities, TSS)
- ✅ `formStatus` with CTL, ATL, TSB
- ✅ `upcomingActivitys` - for WeeklyPlanPreview

### New Data Needed (Add to Hook) 🆕
```typescript
// In apps/mobile/lib/hooks/useHomeData.ts

// Add these calculations:
const trainingReadiness = React.useMemo(() => {
  const ctl = formStatus.ctl || 0;
  const atl = formStatus.atl || 0;
  const tsb = formStatus.tsb || 0;
  
  // Calculate readiness percentage (0-100)
  const percentage = Math.min(100, Math.max(0, 50 + (tsb * 2) + (ctl / 2)));
  
  // Determine status
  let status = 'Moderate';
  if (percentage >= 85) status = 'Prime';
  else if (percentage >= 70) status = 'Good';
  else if (percentage < 50) status = 'Fatigued';
  
  // Determine metric statuses
  const getCtlStatus = () => {
    // Compare to previous week if available
    return 'Steady'; // or 'Rising' / 'Dropping'
  };
  
  const getAtlStatus = () => {
    if (atl < 30) return 'Low';
    if (atl < 50) return 'Moderate';
    return 'High';
  };
  
  const getTsbStatus = () => {
    if (tsb > 15) return 'Fresh';
    if (tsb < -15) return 'Tired';
    return 'Neutral';
  };
  
  return {
    percentage,
    status,
    ctl,
    ctlStatus: getCtlStatus(),
    atl,
    atlStatus: getAtlStatus(),
    tsb,
    tsbStatus: getTsbStatus(),
  };
}, [formStatus]);

// Add to return object
return {
  // ... existing fields
  trainingReadiness,  // NEW
};
```

### Optional: Training Plan Data 🔄
Only needed if building PlanProgressCard:
```typescript
const trainingPlan = React.useMemo(() => {
  // Query your training plan data
  // Return: { name, totalWeeks, weeksCompleted, weeksRemaining, eventDate }
  return null; // or actual plan data
}, []);
```

---

## 🧪 Testing Strategy

### Unit Testing
- [ ] Test training readiness calculation with various CTL/ATL/TSB values
- [ ] Test rest day detection logic
- [ ] Test circular gauge animation

### Visual Testing
- [ ] Compare with mockup (aim for similar feel, not pixel-perfect)
- [ ] Test in light AND dark mode (you support both)
- [ ] Verify spacing consistency

### Integration Testing
- [ ] Test with no data (empty state)
- [ ] Test with rest day
- [ ] Test with active workout
- [ ] Test pull-to-refresh
- [ ] Test navigation actions

### Device Testing
- [ ] iPhone SE (small screen)
- [ ] iPhone 14 Pro (notch handling)
- [ ] Large Android device

---

## 🎯 Success Criteria

### Must Have ✅
- [ ] Circular training readiness gauge displays and animates smoothly
- [ ] Rest day shows dedicated UI (not generic "no activity")
- [ ] All existing functionality preserved
- [ ] No theme conflicts (works with your current styling)
- [ ] Performance maintained (60fps scrolling)

### Nice to Have 🌟
- [ ] Plan progress bar (if you have plan data)
- [ ] Enhanced weekly stats visualization
- [ ] Entrance animations
- [ ] Haptic feedback

### Don't Need ❌
- ❌ Pure black background (your dark gray is fine)
- ❌ Custom color system (use your existing theme)
- ❌ Completely new components (enhance existing ones)
- ❌ Match mockup pixel-perfectly (adapt to your brand)

---

## 📦 Dependencies Check

All major dependencies already installed ✅:
```json
{
  "react-native-svg": "✅ Installed (15.12.1)",
  "react-native-reanimated": "✅ Installed (4.1.3)", 
  "lucide-react-native": "✅ Installed (0.544.0)",
  "nativewind": "✅ Installed (4.2.1)"
}
```

No new dependencies needed! 🎉

---

## 🚀 Quick Start: Build the Hero Component First

### Step 1: Create the Circular Gauge Component

```typescript
// apps/mobile/components/home/TrainingReadinessCard.tsx
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { 
  useSharedValue, 
  useAnimatedProps,
  withTiming,
  Easing 
} from 'react-native-reanimated';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface TrainingReadinessCardProps {
  percentage: number;
  status: string;
  ctl: number;
  ctlStatus: string;
  atl: number;
  atlStatus: string;
  tsb: number;
  tsbStatus: string;
}

export function TrainingReadinessCard({
  percentage,
  status,
  ctl,
  ctlStatus,
  atl,
  atlStatus,
  tsb,
  tsbStatus,
}: TrainingReadinessCardProps) {
  // Gauge dimensions
  const size = 200;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  
  // 220-degree arc (61% of circle)
  const arcLength = circumference * 0.61;
  const progress = useSharedValue(0);
  
  React.useEffect(() => {
    progress.value = withTiming((percentage / 100) * arcLength, {
      duration: 1500,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [percentage, arcLength]);
  
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * 0.195 - progress.value,
  }));
  
  // Status color helper (using your existing theme colors)
  const getStatusColor = (status: string) => {
    if (status.includes('Fresh') || status.includes('Rising')) return 'text-green-500';
    if (status.includes('Dropping') || status.includes('High') || status.includes('Tired')) 
      return 'text-orange-500';
    return 'text-muted-foreground';
  };
  
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground">Training Readiness</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Circular Gauge */}
        <View className="items-center mb-6">
          <View className="relative">
            <Svg width={size} height={size}>
              {/* Background arc */}
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="hsl(var(--muted))"
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${arcLength} ${circumference}`}
                strokeDashoffset={circumference * 0.195}
                strokeLinecap="round"
              />
              
              {/* Progress arc */}
              <AnimatedCircle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="rgb(34, 197, 94)" // green-500
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${arcLength} ${circumference}`}
                animatedProps={animatedProps}
                strokeLinecap="round"
              />
            </Svg>
            
            {/* Center Text */}
            <View className="absolute inset-0 items-center justify-center">
              <Text className="text-foreground text-6xl font-bold">
                {percentage}%
              </Text>
              <Text className="text-foreground text-lg">
                {status}
              </Text>
            </View>
          </View>
        </View>
        
        {/* Metrics Grid */}
        <View className="flex-row justify-between">
          <View className="flex-1">
            <Text className="text-muted-foreground text-xs mb-1">
              Fitness (CTL):
            </Text>
            <View className="flex-row items-baseline gap-1">
              <Text className="text-foreground text-2xl font-semibold">
                {ctl}
              </Text>
              <Text className={`${getStatusColor(ctlStatus)} text-sm`}>
                ({ctlStatus})
              </Text>
            </View>
          </View>
          
          <View className="flex-1">
            <Text className="text-muted-foreground text-xs mb-1">
              Fatigue (ATL):
            </Text>
            <View className="flex-row items-baseline gap-1">
              <Text className="text-foreground text-2xl font-semibold">
                {atl}
              </Text>
              <Text className={`${getStatusColor(atlStatus)} text-sm`}>
                ({atlStatus})
              </Text>
            </View>
          </View>
          
          <View className="flex-1">
            <Text className="text-muted-foreground text-xs mb-1">
              Form (TSB):
            </Text>
            <View className="flex-row items-baseline gap-1">
              <Text className="text-foreground text-2xl font-semibold">
                {tsb > 0 ? '+' : ''}{tsb}
              </Text>
              <Text className={`${getStatusColor(tsbStatus)} text-sm`}>
                ({tsbStatus})
              </Text>
            </View>
          </View>
        </View>
      </CardContent>
    </Card>
  );
}
```

### Step 2: Add to Home Screen

```typescript
// In apps/mobile/app/(internal)/(tabs)/index.tsx

// Add import
import { TrainingReadinessCard } from "@/components/home/TrainingReadinessCard";

// Add to component tree (after TodaysFocusCard)
{trainingReadiness && (
  <TrainingReadinessCard
    percentage={trainingReadiness.percentage}
    status={trainingReadiness.status}
    ctl={trainingReadiness.ctl}
    ctlStatus={trainingReadiness.ctlStatus}
    atl={trainingReadiness.atl}
    atlStatus={trainingReadiness.atlStatus}
    tsb={trainingReadiness.tsb}
    tsbStatus={trainingReadiness.tsbStatus}
  />
)}
```

### Step 3: Update useHomeData Hook

```typescript
// In apps/mobile/lib/hooks/useHomeData.ts

// Add to return object
const trainingReadiness = React.useMemo(() => {
  // Use existing formStatus data
  const ctl = formStatus.ctl || 0;
  const atl = formStatus.atl || 0;
  const tsb = formStatus.tsb || 0;
  
  // Simple readiness calculation
  const percentage = Math.min(100, Math.max(0, 50 + (tsb * 2) + (ctl / 2)));
  
  let status = 'Moderate';
  if (percentage >= 85) status = 'Prime';
  else if (percentage >= 70) status = 'Good';
  else if (percentage < 50) status = 'Fatigued';
  
  return {
    percentage: Math.round(percentage),
    status,
    ctl,
    ctlStatus: 'Steady', // Enhance later with historical comparison
    atl,
    atlStatus: atl < 30 ? 'Low' : atl > 50 ? 'High' : 'Moderate',
    tsb,
    tsbStatus: tsb > 15 ? 'Fresh' : tsb < -15 ? 'Tired' : 'Neutral',
  };
}, [formStatus]);

return {
  // ... existing returns
  trainingReadiness,
};
```

---

## 📝 Key Differences from Original Mockup Plan

### What We're Keeping From Your App ✅
1. **Your existing theme** (dark gray, not pure black)
2. **Your Card/Button/Text components** (already excellent)
3. **Your gradient TodaysFocusCard** (keep the indigo-purple gradient!)
4. **Your data structure** (CTL/ATL/TSB already calculated)
5. **Your navigation** (no changes needed)
6. **Your existing components** (enhance, don't replace)

### What We're Adding 🆕
1. **Circular training readiness gauge** (the hero element)
2. **Rest day variant** for TodaysFocusCard
3. **Optional plan progress bar** (if you have plan data)
4. **Optional enhanced weekly stats** (bar chart visualization)

### What We're NOT Doing ❌
1. ❌ Changing your theme colors
2. ❌ Creating custom styled components
3. ❌ Replacing your Card/Text/Button components
4. ❌ Matching mockup pixel-perfectly
5. ❌ Adding unnecessary dependencies

---

## 💡 Pro Tips

### 1. Start Small
Build TrainingReadinessCard first. Test it. Make sure it works. Then move to next component.

### 2. Use Mock Data Initially
```typescript
// Test with hardcoded data first
const MOCK_READINESS = {
  percentage: 92,
  status: 'Prime',
  ctl: 65,
  ctlStatus: 'Steady',
  atl: 45,
  atlStatus: 'Moderate',
  tsb: 20,
  tsbStatus: 'Fresh',
};
```

### 3. Keep Your Gradient
Your TodaysFocusCard gradient (`from-indigo-600 to-purple-600`) is already great. Don't change it to match the mockup's solid gray card.

### 4. Test Dark Mode
Your theme system supports both light and dark. Make sure the circular gauge works in both modes.

### 5. Performance First
The circular gauge is the only potentially heavy component (SVG + animation). Test on real device to ensure smooth 60fps.

---

## ✅ Definition of Done

A component/feature is complete when:
- [ ] Works with your existing theme (no hardcoded colors)
- [ ] Uses your existing UI components (Card, Text, etc.)
- [ ] Matches your existing code style
- [ ] Tested in light AND dark mode
- [ ] Tested with real data
- [ ] Tested with loading states
- [ ] No performance regressions
- [ ] TypeScript types are correct

---

## 🎊 Final Notes

**Philosophy**: This plan is about **enhancement, not replacement**. Your app already has:
- ✅ Solid architecture
- ✅ Consistent theme
- ✅ Good UX patterns
- ✅ Proper data management

We're adding ONE major visual element (circular gauge) and enhancing a few existing components. That's it. No need to rebuild everything.

**Timeline**: 
- Week 1: Build circular gauge + rest day enhancement (8-12 hours)
- Week 2: Optional enhancements + polish (4-8 hours)
- **Total**: 12-20 hours vs 26-36 hours in original plan

**Success Metric**: The home screen should feel MORE polished while still feeling like YOUR app.

---

**Questions?** Check these files:
- Current home: `apps/mobile/app/(internal)/(tabs)/index.tsx`
- Components: `apps/mobile/components/home/`
- Theme: `apps/mobile/global.css`
- Data hook: `apps/mobile/lib/hooks/useHomeData.ts`
