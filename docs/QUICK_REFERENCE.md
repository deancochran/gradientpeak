# Form Validation Quick Reference

**Last Updated**: January 28, 2025  
**Package**: `@repo/core/schemas/form-schemas.ts`

---

## 🚀 Quick Start

```typescript
// Import the schema and its type
import { profileQuickUpdateSchema, type ProfileQuickUpdateData } from "@repo/core";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

// Use in your form
const form = useForm<ProfileQuickUpdateData>({
  resolver: zodResolver(profileQuickUpdateSchema),
  defaultValues: {
    username: null,
    weight_kg: null,
    ftp: null,
    threshold_hr: null,
  },
});
```

---

## 📋 Common Schemas

### Profile & Settings
```typescript
import { 
  profileSettingsFormSchema,    // Complete profile form
  profileQuickUpdateSchema,      // Quick update (4 fields)
  optionalWeightKgSchema,        // Just weight validation
  optionalFtpSchema,             // Just FTP validation
  optionalThresholdHrSchema,     // Just threshold HR validation
} from "@repo/core";
```

### Activity Submission
```typescript
import { 
  activitySubmissionFormSchema,  // name, notes, is_private
  activityNameSchema,            // Just name validation
  optionalActivityNotesSchema,   // Just notes validation
} from "@repo/core";
```

### Planned Activities
```typescript
import { 
  plannedActivityScheduleFormSchema,  // Schedule new activity
  plannedActivityUpdateFormSchema,    // Update scheduled activity
  plannedActivityRescheduleFormSchema, // Reschedule to new date
} from "@repo/core";
```

### Training Plans
```typescript
import { 
  trainingPlanBasicInfoFormSchema,      // Step 1: Name, description
  trainingPlanWeeklyTargetsFormSchema,  // Step 2: TSS, duration targets
  trainingPlanRecoveryRulesFormSchema,  // Step 3: Recovery settings
} from "@repo/core";
```

---

## ✅ Do's and ❌ Don'ts

### ❌ NEVER Do This
```typescript
// DON'T create local schemas
const profileSchema = z.object({
  username: z.string().min(8).optional().or(z.literal("")),  // ❌ Bad!
  weightKg: z.number().min(30).max(300).optional().or(z.literal("")),  // ❌ Bad!
});

// DON'T use empty strings for optional fields
defaultValues: {
  username: "",        // ❌ Bad!
  ftp: undefined,      // ❌ Bad!
}

// DON'T use camelCase field names
name="weightKg"        // ❌ Bad!
```

### ✅ ALWAYS Do This
```typescript
// DO import from @repo/core
import { profileQuickUpdateSchema, type ProfileQuickUpdateData } from "@repo/core";

// DO use null for optional fields
defaultValues: {
  username: null,      // ✅ Good!
  ftp: null,          // ✅ Good!
}

// DO use snake_case field names (match database)
name="weight_kg"       // ✅ Good!
```

---

## 🔢 Validation Ranges

| Field | Min | Max | Type | Schema |
|-------|-----|-----|------|--------|
| Weight | 30 | 300 | kg | `optionalWeightKgSchema` |
| FTP | 50 | 1000 | watts | `optionalFtpSchema` |
| Threshold HR | 100 | 220 | bpm | `optionalThresholdHrSchema` |
| Max HR | 120 | 250 | bpm | `optionalMaxHrSchema` |
| Resting HR | 30 | 100 | bpm | `optionalRestingHrSchema` |
| Age | 13 | 120 | years | `optionalAgeSchema` |
| Activity Duration | 60 | 28800 | seconds | `estimatedDurationSchema` |
| TSS | 1 | 1000 | - | `estimatedTssSchema` |
| Weekly TSS | 50 | 2000 | - | `weeklyTssTargetSchema` |
| Power Zone | 1 | 7 | zone | `powerZoneSchema` |
| HR Zone | 1 | 5 | zone | `heartRateZoneSchema` |
| RPE | 1 | 10 | scale | `rpeSchema` |
| Cadence | 30 | 200 | RPM | `cadenceSchema` |

---

## 🎯 Common Patterns

### Pattern 1: Optional Numeric Field
```typescript
import { optionalWeightKgSchema } from "@repo/core";

// In your schema
const mySchema = z.object({
  weight_kg: optionalWeightKgSchema,  // Handles empty strings, nulls, string numbers
});

// In your form
defaultValues: {
  weight_kg: null,  // Use null, not "" or undefined
}
```

### Pattern 2: Required Text Field
```typescript
import { activityNameSchema } from "@repo/core";

// In your schema
const mySchema = z.object({
  name: activityNameSchema,  // Required, 1-100 chars, trimmed
});

// In your form
defaultValues: {
  name: "",  // Empty string is fine for required fields
}
```

### Pattern 3: Optional Text Field
```typescript
import { optionalActivityNotesSchema } from "@repo/core";

// In your schema
const mySchema = z.object({
  notes: optionalActivityNotesSchema,  // Optional, max 5000 chars, nullable
});

// In your form
defaultValues: {
  notes: null,  // Use null for optional fields
}
```

### Pattern 4: Date Field
```typescript
import { dateStringSchema, futureDateSchema } from "@repo/core";

// In your schema
const mySchema = z.object({
  scheduled_date: dateStringSchema,  // Any valid date
  // OR
  future_date: futureDateSchema,     // Must be in future
});

// In your form
defaultValues: {
  scheduled_date: new Date().toISOString(),  // ISO string, not Date object
}

// In DatePicker handler
const handleDateChange = (event: any, date?: Date) => {
  if (date) {
    setValue("scheduled_date", date.toISOString());  // Convert to ISO string
  }
};
```

### Pattern 5: Complete Form Schema
```typescript
import { plannedActivityScheduleFormSchema, type PlannedActivityScheduleFormData } from "@repo/core";

const form = useForm<PlannedActivityScheduleFormData>({
  resolver: zodResolver(plannedActivityScheduleFormSchema),
  defaultValues: {
    activity_plan_id: "",           // Required string
    scheduled_date: new Date().toISOString(),  // Required date
    notes: null,                    // Optional string
    training_plan_id: null,         // Optional string
  },
});

const onSubmit = (data: PlannedActivityScheduleFormData) => {
  // data is fully typed and validated
  mutation.mutate(data);
};
```

---

## 🔧 Migration Template

### Step 1: Remove Local Schema
```typescript
// DELETE THIS
import { z } from "zod";

const myLocalSchema = z.object({
  // ... local validation
});

type MyFormData = z.infer<typeof myLocalSchema>;
```

### Step 2: Import from Core
```typescript
// ADD THIS
import { myFormSchema, type MyFormData } from "@repo/core";
```

### Step 3: Update useForm
```typescript
// BEFORE
const form = useForm<MyFormData>({
  resolver: zodResolver(myLocalSchema),  // ❌
  defaultValues: {
    field: "",              // ❌
    numField: undefined,    // ❌
  },
});

// AFTER
const form = useForm<MyFormData>({
  resolver: zodResolver(myFormSchema),   // ✅
  defaultValues: {
    field: null,            // ✅
    numField: null,         // ✅
  },
});
```

### Step 4: Update Field Names
```typescript
// BEFORE
<FormField
  control={form.control}
  name="fieldName"         // ❌ camelCase
  render={({ field }) => ...}
/>

// AFTER
<FormField
  control={form.control}
  name="field_name"        // ✅ snake_case
  render={({ field }) => ...}
/>
```

---

## 🐛 Troubleshooting

### Problem: "Type string is not assignable to type number"
**Solution**: Use the preprocessed schema
```typescript
// ❌ Wrong
z.number().min(50).max(1000)

// ✅ Right
import { optionalFtpSchema } from "@repo/core";
// This handles string-to-number conversion automatically
```

### Problem: Empty strings causing validation errors
**Solution**: Use null for optional fields
```typescript
// ❌ Wrong
defaultValues: { notes: "" }

// ✅ Right
defaultValues: { notes: null }
```

### Problem: "Cannot find name X"
**Solution**: Check your import
```typescript
// ❌ Wrong
import { profileSchema } from "@repo/core";

// ✅ Right
import { profileQuickUpdateSchema } from "@repo/core";
// Schema names must match exactly
```

### Problem: Date validation errors
**Solution**: Use ISO string, not Date object
```typescript
// ❌ Wrong
defaultValues: { scheduled_date: new Date() }

// ✅ Right
defaultValues: { scheduled_date: new Date().toISOString() }
```

---

## 📚 Full Documentation

For complete documentation, see:
- [FORM_SCHEMAS_README.md](./FORM_SCHEMAS_README.md) - Complete usage guide
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - What was implemented
- [form-schemas.ts](./form-schemas.ts) - Source code with JSDoc

---

## 💡 Pro Tips

1. **Always import the type** - TypeScript will catch errors at compile time
2. **Use null for optional fields** - Not `""` or `undefined`
3. **Field names match database** - Use `snake_case`, not `camelCase`
4. **Dates are ISO strings** - Not Date objects in forms
5. **Check the README** - Comprehensive examples for every schema
6. **Don't recreate schemas** - Always import from `@repo/core`

---

## 🎓 Example: Complete Migration

```typescript
// ========================================
// BEFORE: Local schema with issues
// ========================================
import { z } from "zod";

const profileSchema = z.object({
  username: z.string().min(8).optional().or(z.literal("")),  // ❌
  weightKg: z.number().min(30).max(300).optional().or(z.literal("")),  // ❌
  ftp: z.number().min(50).max(1000).optional().or(z.literal("")),  // ❌
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const form = useForm<ProfileFormValues>({
  resolver: zodResolver(profileSchema),
  defaultValues: {
    username: profile?.username || "",
    weightKg: profile?.weight_kg || undefined,
    ftp: profile?.ftp || undefined,
  },
});

// ========================================
// AFTER: Using standardized schema
// ========================================
import { 
  profileQuickUpdateSchema, 
  type ProfileQuickUpdateData 
} from "@repo/core";

const form = useForm<ProfileQuickUpdateData>({
  resolver: zodResolver(profileQuickUpdateSchema),
  defaultValues: {
    username: profile?.username || null,
    weight_kg: profile?.weight_kg || null,
    ftp: profile?.ftp || null,
    threshold_hr: profile?.threshold_hr || null,
  },
});

// Form fields update from weightKg → weight_kg
<FormField name="weight_kg" ... />
```

---

**Remember**: When in doubt, check the [README](./FORM_SCHEMAS_README.md) or look at existing migrated forms!