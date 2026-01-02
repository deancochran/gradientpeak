# Code Organization Refactoring Summary

## Overview
Successfully refactored code organization to eliminate duplication and properly separate concerns between the `@repo/core` package and mobile app.

## Changes Made

### 1. Profile Schema Fixed ✅
**File:** `apps/mobile/lib/validation/schemas.ts`
- **Before:** Duplicate `profileFormSchema` with fields not in database (`max_hr`, `resting_hr`, `age`, `gender`)
- **After:** Re-exports `profileSettingsFormSchema` from `@repo/core` that matches actual database schema
- **Database fields:** `username`, `bio`, `weight_kg`, `ftp`, `threshold_hr`, `dob`, `avatar_url`, `preferred_units`, `language`, `onboarded`

### 2. Date Utilities Moved to Core ✅
**New File:** `packages/core/utils/dates.ts`
- **Functions:** `formatDate`, `formatTime`, `formatDateTime`, `isSameDay`, `isToday`, `isPast`, `isFuture`, `getStartOfWeek`, `getEndOfWeek`, `getWeekDates`, `formatDateRange`, `normalizeDate`, `isDateInRange`
- **Old Location:** `apps/mobile/lib/utils/dates.ts` (now re-exports from core)
- **Benefit:** Reusable across web/mobile apps

### 3. Date Grouping Logic Moved to Core ✅
**New File:** `packages/core/utils/date-grouping.ts`
- **Functions:** `groupActivitiesByDate`, `getActivitiesForWeek`, `getWeekDatesArray`, `isActivityCompleted`, `getDayActivitySummary`
- **Old Location:** `apps/mobile/lib/utils/plan/dateGrouping.ts` (now re-exports from core)
- **Benefit:** Business logic centralized, not UI-specific

### 4. Duration Utilities Deduplicated ✅
**File:** `apps/mobile/lib/utils/durationConversion.ts`
- **Before:** 200+ lines of duplicate code
- **After:** Imports `formatDurationV2`, `getDurationSecondsV2`, `calculateTotalDurationV2` from `@repo/core`
- **Note:** Mobile file kept for backwards compatibility with custom UI conversion helpers

### 5. Validation Schemas Simplified ✅
**File:** `apps/mobile/lib/validation/schemas.ts`
- **Before:** 456 lines with many duplicate and unused schemas
- **After:** 120 lines that re-export from `@repo/core`
- **Removed unused schemas:**
  - `activitySubmissionSchema` (duplicate of core's `activitySubmissionFormSchema`)
  - `activityStepSchema` (not used anywhere)
  - `activityPlanCreationSchema` (not used anywhere)
  - `plannedActivityCreationSchema` (not used anywhere)
  - `emailSchema`, `passwordSchema`, `urlSchema`, `phoneSchema` (duplicates)
  - Helper functions `optionalNumber`, `optionalString` (not used)
  - Form error utilities (not used)

### 6. Core Package Exports Updated ✅
**File:** `packages/core/package.json`
- Added exports for `./utils` and `./utils/*`
- Enables proper TypeScript resolution for new utility modules

## Files That Correctly Stay in Mobile

These files contain mobile-specific logic and should remain:
- `apps/mobile/lib/utils/formErrors.ts` - React Native specific (uses Alert API)
- `apps/mobile/lib/utils/plan/colors.ts` - UI-specific (Tailwind CSS classes)
- `apps/mobile/lib/hooks/*` - React Native hooks
- `apps/mobile/lib/services/*` - Mobile platform services

## Benefits

1. **Single Source of Truth** - Schemas match database exactly
2. **Code Reusability** - Utilities can be used in web app
3. **Easier Maintenance** - Changes in one place
4. **Better Type Safety** - TypeScript can properly resolve imports
5. **Reduced Bundle Size** - No duplicate code in mobile app
6. **Clearer Architecture** - Core = business logic, Apps = UI/platform-specific

## Testing Results

- **TypeScript Errors:** 16 (all pre-existing, unrelated to refactoring)
- **New Errors:** 0
- **Build Status:** ✅ Passing

## Migration Guide for Developers

### Before:
```typescript
import { formatDate } from "@/lib/utils/dates";
import { profileFormSchema } from "@/lib/validation/schemas";
```

### After (recommended):
```typescript
import { formatDate } from "@repo/core";
import { profileSettingsFormSchema } from "@repo/core";
```

### Also Works (backwards compatible):
```typescript
import { formatDate } from "@/lib/utils/dates"; // Re-exports from core
import { profileFormSchema } from "@/lib/validation/schemas"; // Re-exports from core
```

## Next Steps (Optional)

1. Update existing imports to use `@repo/core` directly
2. Remove re-export files in mobile once all imports updated
3. Move activity type configs to core if needed for web app
4. Consider moving more business logic from mobile services to core
