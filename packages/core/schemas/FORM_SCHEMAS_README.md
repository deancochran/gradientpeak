# Form Validation Schemas

**Location**: `@repo/core/schemas/form-schemas.ts`  
**Ground Truth**: Supazod schemas from `@repo/supabase`  
**Purpose**: Standardized, reusable form validation patterns for all applications

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Design Principles](#design-principles)
3. [Available Schemas](#available-schemas)
4. [Usage Examples](#usage-examples)
5. [Migration Guide](#migration-guide)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Overview

This module provides comprehensive, production-ready form validation schemas built on top of Zod. All schemas are designed to:

- **Build on database schemas** - Extend supazod schemas as the ground truth
- **Provide helpful error messages** - User-friendly, actionable feedback
- **Handle edge cases** - Preprocessing, nullability, empty strings
- **Validate cross-field relationships** - E.g., threshold HR < max HR
- **Support incremental migration** - Can be adopted schema-by-schema

---

## Design Principles

### 1. **Single Source of Truth**

All form schemas extend or reference the supazod database schemas. Never duplicate validation logic.

### 2. **Proper Nullability Handling**

❌ **NEVER do this:**
```typescript
z.string().optional().or(z.literal(""))  // BAD!
z.number().optional().or(z.literal(""))  // BAD!
```

✅ **Always do this:**
```typescript
z.string().nullable()                     // GOOD
z.preprocess(emptyStringToNull, z.number().nullable())  // GOOD
```

### 3. **Preprocessing for User Input**

Forms often receive strings that need conversion to numbers or other types:

```typescript
// Handles empty strings, string numbers, and actual numbers
export const optionalWeightKgSchema = z.preprocess(
  (val) => stringToNumber(emptyStringToNull(val)),
  z.number()
    .min(30, "Weight must be at least 30kg")
    .max(300, "Weight must be less than 300kg")
    .nullable()
);
```

### 4. **User-Friendly Error Messages**

Every validation includes clear, actionable error messages:

```typescript
z.number()
  .min(50, "FTP must be at least 50 watts")      // Clear minimum
  .max(1000, "FTP must be less than 1000 watts")  // Clear maximum
  .positive("FTP must be positive")               // Clear constraint
```

### 5. **Cross-Field Validation**

Related fields are validated together to ensure logical consistency:

```typescript
profileSettingsFormSchema
  .refine(
    (data) => {
      if (data.threshold_hr && data.max_hr) {
        return data.threshold_hr < data.max_hr;
      }
      return true;
    },
    {
      message: "Threshold heart rate must be less than maximum heart rate",
      path: ["threshold_hr"],
    }
  )
```

---

## Available Schemas

### 🔤 Reusable Validation Patterns

#### Text & Identifiers
- `emailSchema` - Email validation (lowercase, trimmed)
- `optionalEmailSchema` - Nullable email
- `phoneSchema` - International phone number
- `optionalPhoneSchema` - Nullable phone
- `urlSchema` - URL validation
- `optionalUrlSchema` - Nullable URL
- `usernameSchema` - 3-30 chars, alphanumeric + underscore
- `optionalUsernameSchema` - Nullable username
- `bioSchema` - Max 500 characters
- `optionalBioSchema` - Nullable bio

#### Dates
- `dateStringSchema` - ISO 8601 date validation
- `futureDateSchema` - Must be in the future
- `pastDateSchema` - Must be in the past
- `dobSchema` - Date of birth (13-120 years ago)
- `optionalDobSchema` - Nullable DOB

---

### 👤 Profile & Settings

#### Individual Fields
- `weightKgSchema` - Required weight (30-300 kg)
- `optionalWeightKgSchema` - Nullable weight
- `ftpSchema` - Required FTP (50-1000 watts)
- `optionalFtpSchema` - Nullable FTP
- `thresholdHrSchema` - Required threshold HR (100-220 bpm)
- `optionalThresholdHrSchema` - Nullable threshold HR
- `maxHrSchema` - Required max HR (120-250 bpm)
- `optionalMaxHrSchema` - Nullable max HR
- `restingHrSchema` - Required resting HR (30-100 bpm)
- `optionalRestingHrSchema` - Nullable resting HR
- `ageSchema` - Required age (13-120 years)
- `optionalAgeSchema` - Nullable age
- `genderSchema` - Enum: male, female, other, prefer_not_to_say
- `optionalGenderSchema` - Nullable gender

#### Complete Forms
- `profileSettingsFormSchema` - Full profile settings
  - Includes cross-field validation (HR thresholds, power-to-weight ratio)
  - All fields optional/nullable
  
- `profileQuickUpdateSchema` - Minimal profile update
  - username, weight_kg, ftp, threshold_hr only

---

### 🏃 Activity Submission

- `activityNameSchema` - Required, 1-100 characters
- `activityNotesSchema` - Optional, max 5000 characters
- `optionalActivityNotesSchema` - Nullable notes
- `activitySubmissionFormSchema` - Complete submission form
  - name (required)
  - notes (nullable)
  - is_private (boolean, default false)

---

### 📅 Activity Plans

#### Individual Fields
- `activityPlanNameSchema` - Required, 1-100 characters
- `activityPlanDescriptionSchema` - Optional, max 1000 characters
- `optionalActivityPlanDescriptionSchema` - Nullable description
- `activityPlanNotesSchema` - Nullable, max 2000 characters
- `estimatedDurationSchema` - Required, 60-28800 seconds (1 min - 8 hours)
- `optionalEstimatedDurationSchema` - Nullable duration
- `estimatedTssSchema` - Required, 1-1000
- `optionalEstimatedTssSchema` - Nullable TSS

---

### 📆 Planned Activities

- `plannedActivityScheduleFormSchema` - Schedule an activity
  - activity_plan_id (UUID, required)
  - scheduled_date (ISO date string, required)
  - notes (nullable, max 2000 chars)
  - training_plan_id (UUID, optional)

- `plannedActivityUpdateFormSchema` - Update scheduled activity
  - All fields optional

- `plannedActivityRescheduleFormSchema` - Reschedule to new date
  - new_date (must be in future)
  - reason (optional, max 500 chars)

---

### 🎯 Training Plans

- `trainingPlanNameSchema` - Required, 1-100 characters
- `optionalTrainingPlanDescriptionSchema` - Nullable, max 1000 characters
- `weeklyTssTargetSchema` - Required, 50-2000
- `optionalWeeklyTssTargetSchema` - Nullable weekly TSS

#### Wizard Forms
- `trainingPlanBasicInfoFormSchema` - Step 1: Basic info
- `trainingPlanWeeklyTargetsFormSchema` - Step 2: Weekly targets
- `trainingPlanRecoveryRulesFormSchema` - Step 3: Recovery rules

---

### ⚡ Step Validation

- `stepDurationSecondsSchema` - 30 seconds - 2 hours
- `repetitionCountSchema` - 1-99 repetitions
- `intensityPercentageSchema` - 0-200% (for FTP/HR targets)
- `powerZoneSchema` - 1-7 (7 power zones)
- `heartRateZoneSchema` - 1-5 (5 HR zones)
- `rpeSchema` - 1-10 (Rate of Perceived Exertion)
- `cadenceSchema` - 30-200 RPM
- `speedSchema` - 0.5-20 m/s

---

## Usage Examples

### Example 1: Profile Settings Form (Mobile)

**Before:**
```typescript
const profileSchema = z.object({
  username: z.string().min(8).optional().or(z.literal("")),  // ❌ BAD
  weightKg: z.number().min(30).max(300).optional().or(z.literal("")),  // ❌ BAD
  ftp: z.number().min(50).max(1000).optional().or(z.literal("")),  // ❌ BAD
});
```

**After:**
```typescript
import { profileQuickUpdateSchema, type ProfileQuickUpdateData } from "@repo/core";

const form = useForm<ProfileQuickUpdateData>({
  resolver: zodResolver(profileQuickUpdateSchema),
  defaultValues: {
    username: profile?.username || null,
    weight_kg: profile?.weight_kg || null,
    ftp: profile?.ftp || null,
    threshold_hr: profile?.threshold_hr || null,
  },
});
```

### Example 2: Activity Submission

**Before:**
```typescript
const activityFormSchema = z.object({
  name: z.string().min(1, "Activity name is required"),
  notes: z.string().optional(),
});
```

**After:**
```typescript
import { 
  activitySubmissionFormSchema, 
  type ActivitySubmissionFormData 
} from "@repo/core";

const form = useForm<ActivitySubmissionFormData>({
  resolver: zodResolver(activitySubmissionFormSchema),
  defaultValues: {
    name: "",
    notes: null,
    is_private: false,
  },
});
```

### Example 3: Schedule Activity

**Before:**
```typescript
const scheduleSchema = z.object({
  activityPlanId: z.string().min(1, "Select a plan"),
  scheduledDate: z.date(),
  notes: z.string().optional(),
});
```

**After:**
```typescript
import { 
  plannedActivityScheduleFormSchema, 
  type PlannedActivityScheduleFormData 
} from "@repo/core";

const form = useForm<PlannedActivityScheduleFormData>({
  resolver: zodResolver(plannedActivityScheduleFormSchema),
  defaultValues: {
    activity_plan_id: "",
    scheduled_date: new Date().toISOString(),
    notes: null,
    training_plan_id: null,
  },
});
```

### Example 4: Using Individual Field Schemas

Sometimes you need just one field validator:

```typescript
import { optionalWeightKgSchema, optionalFtpSchema } from "@repo/core";

// Custom form with specific fields
const myCustomSchema = z.object({
  weight_kg: optionalWeightKgSchema,
  ftp: optionalFtpSchema,
  customField: z.string(),
});
```

---

## Migration Guide

### Step-by-Step Migration

1. **Identify Form**: Find the form component with local Zod schema
2. **Find Matching Schema**: Look in `form-schemas.ts` for the appropriate schema
3. **Import Schema**: Replace local schema with imported one
4. **Update Type**: Use the exported TypeScript type
5. **Update Field Names**: Match field names to schema (e.g., `weightKg` → `weight_kg`)
6. **Update Default Values**: Use `null` instead of `""` or `undefined` for optional fields
7. **Test**: Verify validation works as expected

### Example Migration

```diff
- import { z } from "zod";
+ import { profileQuickUpdateSchema, type ProfileQuickUpdateData } from "@repo/core";

- const profileSchema = z.object({
-   username: z.string().min(8).optional().or(z.literal("")),
-   weightKg: z.number().min(30).max(300).optional().or(z.literal("")),
- });
- 
- type ProfileFormValues = z.infer<typeof profileSchema>;

- const form = useForm<ProfileFormValues>({
+ const form = useForm<ProfileQuickUpdateData>({
-   resolver: zodResolver(profileSchema),
+   resolver: zodResolver(profileQuickUpdateSchema),
    defaultValues: {
-     username: profile?.username || "",
-     weightKg: profile?.weight_kg || undefined,
+     username: profile?.username || null,
+     weight_kg: profile?.weight_kg || null,
    },
  });
```

---

## Best Practices

### ✅ DO

1. **Use the provided schemas** - Don't recreate validation logic
2. **Use `null` for optional fields** - Not `""` or `undefined`
3. **Import types along with schemas** - Type safety is important
4. **Validate on the client and server** - Never trust client-side only
5. **Provide helpful error messages** - Already included in schemas
6. **Use preprocessing schemas for user input** - They handle edge cases

### ❌ DON'T

1. **Don't use `.or(z.literal(""))`** - Use `.nullable()` instead
2. **Don't duplicate validation logic** - Extend existing schemas
3. **Don't hardcode magic numbers** - Use schema constants
4. **Don't skip type inference** - Always use TypeScript types
5. **Don't ignore cross-field validation** - Important for data integrity
6. **Don't modify core schemas directly** - Extend or compose them

---

## Validation Ranges Reference

### Physiological Metrics

| Metric | Min | Max | Unit | Notes |
|--------|-----|-----|------|-------|
| Weight | 30 | 300 | kg | Children to heavyweight athletes |
| FTP | 50 | 1000 | watts | Beginner to world-class cyclist |
| Threshold HR | 100 | 220 | bpm | All age groups |
| Max HR | 120 | 250 | bpm | Physiological maximum |
| Resting HR | 30 | 100 | bpm | Elite athletes to sedentary |
| Age | 13 | 120 | years | App minimum to theoretical max |

### Activity Metrics

| Metric | Min | Max | Unit | Notes |
|--------|-----|-----|------|-------|
| Activity Duration | 60 | 28800 | seconds | 1 min to 8 hours |
| Step Duration | 30 | 7200 | seconds | 30 sec to 2 hours |
| TSS | 1 | 1000 | - | Recovery ride to epic event |
| Weekly TSS | 50 | 2000 | - | Recovery week to peak training |
| Repetitions | 1 | 99 | count | Single to many intervals |
| Intensity % | 0 | 200 | % | Rest to supra-maximal |
| Power Zone | 1 | 7 | zone | 7-zone model |
| HR Zone | 1 | 5 | zone | 5-zone model |
| RPE | 1 | 10 | scale | Borg scale |
| Cadence | 30 | 200 | RPM | Walking to sprinting |
| Speed | 0.5 | 20 | m/s | Slow walk to sprint |

---

## Troubleshooting

### Problem: "Type string is not assignable to type number"

**Cause**: Form inputs return strings by default

**Solution**: Use preprocessing schemas that handle string-to-number conversion

```typescript
// ✅ Use the preprocessed schema
import { optionalWeightKgSchema } from "@repo/core";

// This handles string inputs automatically
const schema = z.object({
  weight_kg: optionalWeightKgSchema,  // Handles "75" or 75
});
```

### Problem: Empty strings causing validation errors

**Cause**: HTML inputs use `""` for empty values, but schema expects `null`

**Solution**: Use schemas with `emptyStringToNull` preprocessing

```typescript
// Already built-in to optional schemas
import { optionalFtpSchema } from "@repo/core";

// This converts "" to null automatically
```

### Problem: Optional fields showing required errors

**Cause**: Using `.optional()` with `.min()` validates the string when present

**Solution**: Use `.nullable()` and preprocessing

```typescript
// ❌ This requires at least 8 chars if value is present
z.string().min(8).optional()

// ✅ This allows null or a valid string
z.preprocess(
  emptyStringToNull,
  z.string().min(8).nullable()
)
```

### Problem: Cross-field validation not working

**Cause**: Using individual field schemas without the form-level schema

**Solution**: Use the complete form schema that includes `.refine()`

```typescript
// ✅ Use the form schema with built-in cross-validation
import { profileSettingsFormSchema } from "@repo/core";

// This includes threshold_hr < max_hr validation
```

### Problem: Date validation errors

**Cause**: Date objects vs ISO strings confusion

**Solution**: Store dates as ISO strings in the form

```typescript
const form = useForm({
  defaultValues: {
    scheduled_date: new Date().toISOString(),  // ✅ String
    // NOT: new Date()  // ❌ Object
  },
});

// When using DateTimePicker, convert to ISO string
const handleDateChange = (event: any, date?: Date) => {
  if (date) {
    setValue("scheduled_date", date.toISOString());  // ✅
  }
};
```

---

## Adding New Schemas

When you need to add a new form schema:

1. **Check if it exists** - Look in `form-schemas.ts` first
2. **Follow patterns** - Use existing schemas as templates
3. **Add preprocessing** - Handle empty strings and type conversion
4. **Include validation messages** - User-friendly, actionable
5. **Add cross-field validation** - If fields are related
6. **Export type** - Always export the inferred TypeScript type
7. **Document it** - Add to this README
8. **Test edge cases** - Empty strings, null, undefined, wrong types

### Template for New Field Schema

```typescript
/**
 * [Field Name] validation
 * [Description of what this validates]
 * Range: [min] - [max] [units]
 */
export const myFieldSchema = z.preprocess(
  stringToNumber,
  z
    .number({
      required_error: "[Field] is required",
      invalid_type_error: "[Field] must be a number",
    })
    .min(MIN_VALUE, "[Field] must be at least [MIN_VALUE] [units]")
    .max(MAX_VALUE, "[Field] must be less than [MAX_VALUE] [units]")
    .positive("[Field] must be positive")
);

/**
 * Optional [field name]
 */
export const optionalMyFieldSchema = z.preprocess(
  (val) => stringToNumber(emptyStringToNull(val)),
  z
    .number()
    .min(MIN_VALUE, "[Field] must be at least [MIN_VALUE] [units]")
    .max(MAX_VALUE, "[Field] must be less than [MAX_VALUE] [units]")
    .positive("[Field] must be positive")
    .nullable()
);
```

---

## Related Documentation

- [Supazod Schemas](../../supabase/supazod/schemas.ts) - Database ground truth
- [Activity Plan Structure](./activity_plan_structure.ts) - Complex nested schemas
- [React Hook Form Docs](https://react-hook-form.com/) - Form library usage
- [Zod Docs](https://zod.dev/) - Schema validation library

---

## Questions or Issues?

If you encounter a missing schema or validation pattern, please:

1. Check if a similar schema exists that can be extended
2. Create a new schema following the patterns in this file
3. Add it to this documentation
4. Submit a PR with tests

**Remember**: The goal is consistency and reusability across all applications. These schemas are the single source of truth for form validation.