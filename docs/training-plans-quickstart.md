# Training Plans Feature - Quick Start Guide

## For Developers

This quick start guide helps you understand and work with the Training Plans feature implementation.

## 🚀 Getting Started

### File Locations

```
apps/mobile/src/app/(internal)/(tabs)/plan/training-plan/
├── index.tsx                  # Overview screen (Phase 1)
├── calendar.tsx               # Calendar view (Phase 2)
├── create/index.tsx           # Wizard (Phase 3)
└── components/                # All components
```

### Key Files to Know

1. **Overview:** `training-plan/index.tsx`
2. **Calendar:** `training-plan/calendar.tsx`
3. **Create Wizard:** `training-plan/create/index.tsx`
4. **Full Documentation:** `training-plan/README.md`

## 📖 Understanding the Feature

### What is a Training Plan?

A training plan helps users:
- Build fitness systematically
- Track CTL (Chronic Training Load) - long-term fitness
- Track ATL (Acute Training Load) - recent fatigue
- Monitor TSB (Training Stress Balance) - current form
- Schedule workouts with constraint validation
- Prevent overtraining

### Key Metrics

```typescript
CTL = 42-day exponential moving average of TSS (fitness)
ATL = 7-day exponential moving average of TSS (fatigue)
TSB = CTL - ATL (form/freshness)
```

**Form Status:**
- TSB > 10: Fresh (ready for hard training)
- TSB 5-10: Optimal
- TSB -10 to 5: Neutral
- TSB -20 to -10: Tired (need recovery)
- TSB < -20: Overreaching (high fatigue)

## 🏗️ Architecture Overview

### Component Organization

**Rule: No component over 500 lines**

All components are organized by feature:
- `components/` - Shared components (CurrentStatusCard, etc.)
- `components/calendar/` - Calendar-specific components
- `create/components/` - Wizard components
- `create/components/steps/` - Individual wizard steps

### State Management Pattern

```typescript
// Server State (tRPC)
const { data: plan } = trpc.trainingPlans.get.useQuery();

// UI State (React)
const [selectedDate, setSelectedDate] = useState<Date | null>(null);

// Complex State (Custom Hooks)
const { currentStep, formData, nextStep } = useWizardForm();
```

## 🛠️ Common Tasks

### 1. Add a New Calendar Component

```typescript
// 1. Create component in components/calendar/
// apps/mobile/src/app/(internal)/(tabs)/plan/training-plan/components/calendar/NewComponent.tsx

import { View } from "react-native";
import { Text } from "@/components/ui/text";

interface NewComponentProps {
  // Define props
}

export function NewComponent({ ...props }: NewComponentProps) {
  return (
    <View>
      <Text>New Component</Text>
    </View>
  );
}

// 2. Export from index.ts
// components/calendar/index.ts
export { NewComponent } from "./NewComponent";

// 3. Use in calendar.tsx
import { NewComponent } from "./components/calendar";
```

### 2. Add a New Wizard Step

```typescript
// 1. Create step component
// create/components/steps/Step6NewStep.tsx

interface Step6NewStepProps {
  value: string;
  onChange: (value: string) => void;
  errors?: { fieldName?: string };
}

export function Step6NewStep({ value, onChange, errors }: Step6NewStepProps) {
  return (
    <View className="gap-6">
      {/* Step content */}
    </View>
  );
}

// 2. Update useWizardForm hook
// create/components/hooks/useWizardForm.ts

export interface TrainingPlanFormData {
  // ... existing fields
  newField: string; // Add new field
}

const validateStep6 = (): boolean => {
  // Add validation logic
};

// 3. Add to wizard index.tsx
const STEP_TITLES = [
  // ... existing steps
  "New Step Title",
];

const renderStepContent = () => {
  switch (currentStep) {
    // ... existing cases
    case 6:
      return (
        <Step6NewStep
          value={formData.newField}
          onChange={(value) => updateField("newField", value)}
          errors={errors}
        />
      );
  }
};
```

### 3. Add a New tRPC Endpoint Integration

```typescript
// In calendar.tsx (example)

// Replace placeholder with real query
const { data: plannedActivities = [], isLoading } = 
  trpc.plannedActivities.listByWeek.useQuery({
    week_start: currentWeekStart.toISOString(),
    week_end: currentWeekEnd.toISOString(),
  }, {
    enabled: !!plan,
  });

// Remove TODO comment
// Update types if needed
```

## 🧪 Testing Your Changes

### Manual Testing Checklist

**Calendar:**
```bash
# 1. Navigate to Training Plan
# 2. Click "View Calendar"
# 3. Test week navigation (prev/next)
# 4. Verify today is highlighted
# 5. Test "Add Workout" buttons
# 6. Check weekly summary updates
```

**Wizard:**
```bash
# 1. Navigate to Training Plan
# 2. Click "Create Training Plan"
# 3. Complete all 5 steps
# 4. Verify validation on each step
# 5. Test back button
# 6. Test skip on step 5
# 7. Submit and verify creation
```

## 📝 Code Style Guidelines

### Component Template

```typescript
import { View } from "react-native";
import { Text } from "@/components/ui/text";

interface MyComponentProps {
  title: string;
  onPress?: () => void;
}

/**
 * Brief description of what this component does
 * Include any important notes or usage guidelines
 */
export function MyComponent({ title, onPress }: MyComponentProps) {
  return (
    <View className="gap-4 p-4">
      <Text className="text-lg font-bold">{title}</Text>
    </View>
  );
}
```

### Hook Template

```typescript
import { useState, useCallback } from "react";

/**
 * Hook description
 * Explain what state it manages and when to use it
 */
export function useMyHook() {
  const [state, setState] = useState(initialValue);

  const doSomething = useCallback(() => {
    // Implementation
  }, [dependencies]);

  return {
    // State
    state,
    
    // Actions
    doSomething,
    
    // Computed
    isReady: !!state,
  };
}
```

### Naming Conventions

- **Components:** PascalCase (e.g., `WeekNavigator.tsx`)
- **Hooks:** camelCase with "use" prefix (e.g., `useWeekNavigation.ts`)
- **Interfaces:** PascalCase with "Props" suffix (e.g., `WeekNavigatorProps`)
- **Functions:** camelCase (e.g., `handleNextWeek`)
- **Constants:** UPPER_SNAKE_CASE (e.g., `STEP_TITLES`)

## 🐛 Debugging Tips

### Common Issues

**1. "Property doesn't exist on type" error:**
```typescript
// Check if tRPC endpoint exists
// If not, add TODO comment and use placeholder
const data = []; // TODO: Implement trpc.endpoint.name
```

**2. Component not rendering:**
```typescript
// Check imports
import { MyComponent } from "./components/calendar"; // ✅ Barrel export
import { MyComponent } from "./components/calendar/MyComponent"; // ✅ Direct

// Verify export in index.ts
export { MyComponent } from "./MyComponent";
```

**3. State not updating:**
```typescript
// Ensure proper state updates
setFormData(prev => ({ ...prev, field: value })); // ✅
setFormData({ ...formData, field: value }); // ⚠️ Can miss updates
```

### Debug Logging

```typescript
// Add temporary logging
console.log("[Calendar] Week data:", weekData);
console.log("[Wizard] Current step:", currentStep, formData);

// Remove before committing
```

## 📚 Additional Resources

### Documentation

- **Full README:** `training-plan/README.md` (352 lines)
- **Implementation Summary:** `docs/training-plans-implementation-summary.md`
- **Roadmap:** `docs/training-plans-ui-first-roadmap.md`

### Key Concepts

- **PMC (Performance Management Chart):** The science behind CTL/ATL/TSB
- **TSS (Training Stress Score):** Quantifies workout difficulty
- **Constraint Validation:** Ensures workouts meet recovery rules
- **Periodization:** Progressive fitness building over time

### External Learning

- TrainingPeaks PMC documentation
- "The Cyclist's Training Bible" by Joe Friel
- Exponential moving averages in fitness

## 🎯 Quick Reference

### Important Paths

```bash
# Main implementation
apps/mobile/src/app/(internal)/(tabs)/plan/training-plan/

# Components
apps/mobile/src/app/(internal)/(tabs)/plan/training-plan/components/

# Documentation
apps/mobile/docs/training-plans-*.md
```

### Key Commands

```bash
# Start dev server
bun run dev

# Type check
bun run typecheck

# Lint
bun run lint

# Format
bun run format
```

### Component Sizes

- Keep under 300 lines ideally
- Maximum 500 lines (hard limit)
- Extract logic to hooks if growing large
- Split into sub-components if UI is complex

## ✅ Checklist for New Features

- [ ] Component created in correct directory
- [ ] Props interface defined
- [ ] JSDoc comment added
- [ ] Exported from index.ts (if reusable)
- [ ] Imported and used in parent
- [ ] Types are correct
- [ ] No lint errors
- [ ] Tested manually
- [ ] Updated README if significant change

## 🤝 Getting Help

1. **Check README.md** - Comprehensive documentation
2. **Look at existing components** - Follow established patterns
3. **Check implementation summary** - Understand what was built
4. **Review roadmap** - See where feature is going

## 💡 Tips

- **Start small:** Make incremental changes
- **Test often:** Verify after each component
- **Follow patterns:** Look at existing code
- **Document as you go:** Future you will thank you
- **Keep it simple:** Don't over-engineer

---

**Happy Coding!** 🚀

For questions or issues, refer to the full README or implementation summary documents.