# Plan Tab Refactoring - Quick Reference Card

**Last Updated:** 2025-01-23

---

## 🎯 TL;DR

Your plan tab needs **2-3 sprints of refactoring** before production:
- 🔴 Convert StyleSheet → NativeWind
- 🔴 Complete calendar TODOs
- 🔴 Integrate Intensity Factor system
- 🟡 Add TypeScript types
- 🟡 Standardize components

**Grade: B- (75/100)** - Good foundation, needs polish.

---

## 📊 Quick Scores

| Page | Score | Status | Top Issue |
|------|-------|--------|-----------|
| Main Index | 7/10 | 🟡 OK | Too many actions |
| Training Overview | 7.5/10 | 🟢 Good | Missing trends |
| Library | 7/10 | 🟡 OK | Visual noise |
| Scheduled | 5/10 | 🔴 Poor | Uses StyleSheet |
| Calendar | 4/10 | 🔴 Poor | TODOs/incomplete |
| StatusCard | 8/10 | 🟢 Good | Minor tweaks |

---

## 🚨 Critical Fixes (Do First)

### 1. Remove StyleSheet (2-3 hours)
```typescript
// ❌ BAD - planned_activities/index.tsx
const styles = StyleSheet.create({ ... });
<View style={styles.container}>

// ✅ GOOD
<View className="flex-1 bg-background">
```

### 2. Use Shared Constants (1-2 hours)
```typescript
// ❌ BAD - Duplicated everywhere
const ACTIVITY_CONFIGS = { outdoor_run: { ... } };

// ✅ GOOD - Already in core package!
import { ACTIVITY_TYPE_CONFIG } from '@gradientpeak/core';
const config = ACTIVITY_TYPE_CONFIG[activity.activity_type];
```

### 3. Complete Calendar (4-5 hours)
```typescript
// ❌ BAD - calendar.tsx
const plannedActivities: any[] = []; // TODO
const completedActivities: any[] = []; // TODO

// ✅ GOOD - Implement these endpoints:
trpc.plannedActivities.listByWeek.useQuery({ startDate, endDate });
trpc.activities.listByDateRange.useQuery({ startDate, endDate });
```

### 4. Add Intensity Factor (8-10 hours)
```typescript
// ❌ BAD - Missing from all cards
<Text>{duration} min • TSS {tss}</Text>

// ✅ GOOD
<ActivityMetrics
  duration={duration}
  tss={tss}
  intensityFactor={0.85} // NEW!
  zone="Threshold" // NEW!
/>
```

---

## 📁 Files That Need Work

### Priority 1 - Critical
- [ ] `plan/planned_activities/index.tsx` - Remove StyleSheet (180+ lines!)
- [ ] `plan/training-plan/calendar.tsx` - Complete TODOs
- [ ] `api/trpc/routers/planned-activities.ts` - Add listByWeek endpoint
- [ ] `api/trpc/routers/activities.ts` - Add listByDateRange endpoint

### Priority 2 - High
- [ ] `plan/library/index.tsx` - Use shared ACTIVITY_TYPE_CONFIG
- [ ] `plan/planned_activities/index.tsx` - Use shared ACTIVITY_TYPE_CONFIG
- [ ] `plan/index.tsx` - Replace `any` types
- [ ] `plan/training-plan/index.tsx` - Replace `any` types

### Priority 3 - Medium
- [ ] Create `components/activities/ActivityCard.tsx` - Unified card
- [ ] Create `components/activities/IntensityBadge.tsx` - IF display
- [ ] Create `components/training/IntensityDistribution.tsx` - Zone chart

---

## 🔄 Quick Migration Patterns

### StyleSheet → NativeWind
```typescript
// Before
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { color: '#6b7280' },
});
<View style={styles.container}>
  <Text style={styles.title}>Title</Text>
  <Text style={styles.subtitle}>Subtitle</Text>
</View>

// After
<View className="flex-1 p-4">
  <Text className="text-2xl font-bold">Title</Text>
  <Text className="text-muted-foreground">Subtitle</Text>
</View>
```

### any → Typed
```typescript
// Before
const handleActivity = (activity: any) => { ... }
todaysActivities.map((activity: any) => ...)

// After
import type { PlannedActivity } from '@gradientpeak/core';
const handleActivity = (activity: PlannedActivity) => { ... }
todaysActivities.map((activity: PlannedActivity) => ...)
```

### Duplicate Constants → Shared
```typescript
// Before (in each file)
const ACTIVITY_CONFIGS = {
  outdoor_run: { name: "Run", icon: Footprints, color: "text-blue-600" },
  // ...
};

// After (import once)
import { ACTIVITY_TYPE_CONFIG, getActivityIcon } from '@gradientpeak/core';

const config = ACTIVITY_TYPE_CONFIG[activityType];
const IconComponent = getActivityIcon(config.icon);
<Icon as={IconComponent} style={{ color: config.color }} />
```

---

## 📦 New Shared Code (Already Created!)

### ✅ Available Now in `packages/core/constants.ts`:

```typescript
// Activity types
import { ACTIVITY_TYPE_CONFIG, ActivityType } from '@gradientpeak/core';

// Intensity zones (7 zones based on IF%)
import { INTENSITY_ZONES, getIntensityZone } from '@gradientpeak/core';

// Activity categories
import { ACTIVITY_CATEGORIES } from '@gradientpeak/core';
```

### 🔲 Need to Create:

```typescript
// Types
packages/core/src/types/training-plan.ts
packages/core/src/types/activity-plan.ts
packages/core/src/types/planned-activity.ts

// Utilities
packages/core/utils/date-grouping.ts
packages/core/utils/training-calendar.ts

// Components
components/activities/ActivityCard.tsx
components/activities/IntensityBadge.tsx
components/training/IntensityDistribution.tsx
components/training/RecoveryInsight.tsx
```

---

## 🎨 Style Guide Quick Ref

### Spacing
- `gap-2` = 8px
- `gap-3` = 12px  ← Most common
- `gap-4` = 16px
- `p-4` = 16px padding
- `mb-6` = 24px margin bottom

### Typography
- `text-2xl font-bold` = 24px bold (Page titles)
- `text-lg font-semibold` = 18px semibold (Section headers)
- `text-base font-semibold` = 16px semibold (Card titles)
- `text-sm text-muted-foreground` = 14px muted (Metadata)
- `text-xs text-muted-foreground` = 12px muted (Labels)

### Colors
- `text-foreground` = Main text
- `text-muted-foreground` = Secondary text (#6b7280)
- `bg-background` = Page background
- `bg-muted` = Card backgrounds
- `bg-muted/30` = Light overlay
- `text-primary` = Brand blue
- `text-destructive` = Error red

### Layout
- `flex-1` = flex: 1 (fill space)
- `flex-row` = flexDirection: row
- `items-center` = alignItems: center
- `justify-between` = justifyContent: space-between
- `rounded-lg` = borderRadius: 8px
- `rounded-full` = borderRadius: 9999px

---

## 🧪 Testing Checklist

Before marking complete:
- [ ] No StyleSheet imports in plan tab
- [ ] No `any` types in plan tab
- [ ] Calendar shows real data (not empty arrays)
- [ ] All activities show Intensity Factor
- [ ] All cards look consistent
- [ ] No console errors
- [ ] Page loads < 1 second
- [ ] Works on iOS and Android

---

## 📚 Full Documentation

### For Detailed Analysis:
→ **PLAN_UI_REVIEW.md** (500+ lines)
   - Page-by-page breakdown
   - Specific code examples
   - Scoring methodology

### For Step-by-Step Guide:
→ **PLAN_REFACTOR_MIGRATION.md** (690+ lines)
   - Phase-by-phase instructions
   - Code snippets for each change
   - Testing strategy

### For Big Picture:
→ **PLAN_REVIEW_SUMMARY.md** (280+ lines)
   - Executive summary
   - Effort estimates
   - Success criteria

---

## 💡 Pro Tips

1. **Start with StyleSheet removal** - Highest impact, lowest risk
2. **Don't skip types** - They'll save debugging time later
3. **Test incrementally** - Don't change everything at once
4. **Use feature flags** - For calendar and intensity features
5. **Review existing patterns** - Check other tabs for consistency

---

## ⏱️ Time Estimates

| Task | Time | Complexity |
|------|------|------------|
| StyleSheet → NativeWind | 3h | Easy |
| Shared constants migration | 2h | Easy |
| Complete calendar TODOs | 5h | Medium |
| Add TypeScript types | 4h | Easy |
| Intensity Factor integration | 10h | Medium |
| Standardize card components | 6h | Medium |
| Enhanced filtering | 4h | Medium |
| Testing & docs | 12h | Easy |
| **TOTAL** | **46h** | **~1.5 sprints** |

---

## 🎯 Success Metrics

You're done when:
- ✅ All pages use NativeWind (no StyleSheet)
- ✅ All pages use shared ACTIVITY_TYPE_CONFIG
- ✅ Zero `any` types
- ✅ Calendar shows real workouts
- ✅ IF visible on every activity
- ✅ Cards look the same everywhere
- ✅ Test coverage > 80%

---

## 🆘 Need Help?

1. Check the detailed docs above
2. Look at existing components for patterns
3. Test each change before moving on
4. Use feature flags for risky changes
5. Ask for review before deploying

---

**Remember:** This is a polish pass, not a rewrite. The foundation is solid! 🚀