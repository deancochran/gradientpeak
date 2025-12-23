# Core Package Export Strategy Analysis

## Current State Assessment

### Strengths ✅
1. **Good barrel file usage** - `schemas/index.ts` and `samples/index.ts` are well-structured
2. **Clear namespace separation** - calculations, constants, schemas, samples, utils are distinct
3. **Some duplicate prevention** - Manually excluding conflicts in main index.ts
4. **V2 migration pattern** - Good use of suffixes (V2) to handle schema evolution

### Issues & Pain Points ❌

#### 1. **Deep Imports Are Common**
Many consumers bypass the main barrel and import directly from submodules:
```typescript
// Current (inconsistent):
import { DurationV2 } from "@repo/core/schemas/activity_plan_v2";
import { PublicProfilesRow } from "@repo/core";
```

#### 2. **Manual Conflict Management**
Your main `index.ts` has lots of manual exclusions:
```typescript
// From plan-view-logic: export everything EXCEPT ActivityType, canHaveRoute...
export { isIndoorActivity } from "./utils/plan-view-logic";
```
This is error-prone and requires constant maintenance.

#### 3. **Missing Utils Barrel**
No `utils/index.ts` means you must manually re-export each util function in the main index.

#### 4. **Inconsistent Export Patterns**
- `samples/` has its own index ✅
- `schemas/` has its own index ✅
- `utils/` does NOT have its own index ❌

#### 5. **Type-Only vs Runtime Mixing**
Some imports need type-only, but exports don't distinguish:
```typescript
export type { LatLng, LatLngAlt, RouteStats } from "./utils/polyline";
```

---

## Recommended Export Strategy

### Philosophy
1. **Barrel files at every level** - Each subdirectory should have an `index.ts`
2. **Export everything by default** - Only exclude when there's a clear conflict
3. **Namespace exports for advanced use** - Allow both flat and namespaced imports
4. **Minimal manual maintenance** - Use `export *` wherever possible

---

## Implementation Plan

### 1. Create `utils/index.ts`
```typescript
// utils/index.ts
export * from "./activity-defaults";
export * from "./plan-view-logic";
export * from "./polyline";
export * from "./recording-config-resolver";
```

### 2. Simplify Main `index.ts`
```typescript
// index.ts - Simplified approach

// === Core Modules (export everything) ===
export * from "./calculations";
export * from "./constants";
export * from "./database-types";
export * from "./ftms-types";

// === Organized Modules (with barrel files) ===
export * from "./schemas";
export * from "./samples";
export * from "./utils";

// === Namespace Exports (for advanced use) ===
// Allows: import { Schemas, Utils, Samples } from "@repo/core"
export * as Schemas from "./schemas";
export * as Utils from "./utils";
export * as Samples from "./samples";
export * as Constants from "./constants";
export * as Calculations from "./calculations";
```

### 3. Handle Conflicts Explicitly
If conflicts arise, use TypeScript's conflict resolution:

**Option A: Rename at source**
```typescript
// activity_plan_structure.ts
export { ActivityType as ActivityTypeV1 } from "./activity_payload";
```

**Option B: Re-export with new names in barrel**
```typescript
// schemas/index.ts
export { ActivityType } from "./activity_payload";
export { ActivityType as ActivityTypeV1 } from "./activity_plan_structure";
```

**Option C: Document preferred import**
```typescript
// Add JSDoc in schemas/index.ts
/**
 * @deprecated Use ActivityType from activity_payload instead
 */
export { ActivityType as ActivityTypeLegacy } from "./old-file";
```

### 4. Support Multiple Import Styles

With the namespace exports, consumers can choose their style:

```typescript
// Style 1: Flat imports (recommended for common usage)
import { formatDuration, PublicProfilesRow, SAMPLE_ACTIVITIES } from "@repo/core";

// Style 2: Namespaced imports (recommended for clarity)
import { Schemas, Utils, Constants } from "@repo/core";
const myPlan = Schemas.activityPlanCreateSchema.parse(data);
const distance = Utils.calculateDistance(point1, point2);

// Style 3: Direct imports (for specific types/advanced usage)
import type { DurationV2 } from "@repo/core/schemas/activity_plan_v2";

// Style 4: Mixed approach
import { formatDuration } from "@repo/core";
import type { ActivityPlanStructureV2 } from "@repo/core/schemas/activity_plan_v2";
```

---

## File Structure Recommendations

### Current Structure (Good!)
```
packages/core/
├── index.ts                 # Main barrel
├── calculations.ts          # Single file
├── constants.ts             # Single file
├── database-types.ts        # Single file
├── ftms-types.ts           # Single file
├── schemas/
│   ├── index.ts            # ✅ Has barrel
│   └── *.ts
├── samples/
│   ├── index.ts            # ✅ Has barrel
│   └── *.ts
└── utils/
    └── *.ts                # ❌ Missing barrel
```

### Recommended Structure (Better!)
```
packages/core/
├── index.ts                 # Main barrel (simplified)
├── calculations.ts
├── constants.ts
├── database-types.ts
├── ftms-types.ts
├── schemas/
│   ├── index.ts            # Barrel (export *)
│   └── *.ts
├── samples/
│   ├── index.ts            # Barrel (export *)
│   └── *.ts
└── utils/
    ├── index.ts            # NEW: Barrel (export *)
    └── *.ts
```

---

## Migration Steps

### Phase 1: Add Missing Barrels (Low Risk)
1. Create `utils/index.ts` with `export *`
2. Update main `index.ts` to use `export * from "./utils"`
3. Test that all existing imports still work

### Phase 2: Add Namespace Exports (Low Risk)
1. Add namespace re-exports to main `index.ts`
2. Document new import patterns in README
3. No breaking changes - purely additive

### Phase 3: Clean Up Conflicts (Medium Risk)
1. Identify actual conflicts (run `tsc` to find duplicates)
2. Rename conflicting exports at source with V1/V2 suffixes
3. Update consumers to use new names
4. Add deprecation warnings for old names

### Phase 4: Simplify Main Index (Low Risk)
1. Replace manual exclusions with `export *`
2. Remove comments about manual exclusions
3. Add conflict resolution only where actually needed

---

## Benefits of This Strategy

### For Maintainers
- ✅ Less manual work when adding new exports
- ✅ Fewer merge conflicts in `index.ts`
- ✅ Clear organization by subdirectory
- ✅ Easy to add new modules without touching main index

### For Consumers
- ✅ Flexible import styles (flat, namespaced, direct)
- ✅ Clear discoverability through TypeScript autocomplete
- ✅ Type-safe imports with good IDE support
- ✅ Can deep-import for tree-shaking when needed

### For the Codebase
- ✅ Scales well as package grows
- ✅ Clear boundaries between modules
- ✅ Easy to split into separate packages later if needed
- ✅ Standard TypeScript barrel file pattern

---

## Conflict Resolution Strategy

When you encounter duplicate exports:

### 1. Check if it's a real conflict
```bash
# Find duplicate exports
cd packages/core
npx tsc --noEmit 2>&1 | grep "has already been declared"
```

### 2. Resolve by priority
**Priority 1: Newer versions win**
- Keep `ActivityPlanStructureV2`, deprecate V1

**Priority 2: More specific names win**
- Keep `calculateDistanceHaversine` over `calculateDistance`

**Priority 3: Most used wins**
- Check usage with: `grep -r "import.*ActivityType" apps/`

### 3. Document the decision
```typescript
/**
 * @deprecated Use ActivityPlanStructureV2 instead
 * This is kept for backward compatibility only
 */
export type ActivityPlanStructure = ActivityPlanStructureV1;
```

---

## Testing Your Export Strategy

### 1. Build Test
```bash
cd packages/core
pnpm build
```

### 2. Import Test
Create a test file:
```typescript
// packages/core/__tests__/exports.test.ts
import * as Core from "../index";

describe("Core package exports", () => {
  it("should export all main modules", () => {
    expect(Core.Schemas).toBeDefined();
    expect(Core.Utils).toBeDefined();
    expect(Core.Samples).toBeDefined();
    expect(Core.Constants).toBeDefined();
  });

  it("should export common functions", () => {
    expect(Core.formatDuration).toBeDefined();
    expect(Core.calculateDistance).toBeDefined();
    expect(Core.SAMPLE_ACTIVITIES).toBeDefined();
  });
});
```

### 3. Consumer Test
Check that existing imports still work:
```bash
cd apps/mobile
pnpm typecheck
```

---

## Quick Wins (Start Here)

### 1. Create `utils/index.ts` (5 minutes)
This alone will clean up your main index significantly.

### 2. Add namespace exports (5 minutes)
Provides better organization for consumers.

### 3. Document import patterns (10 minutes)
Add a section to your README showing recommended import styles.

### 4. Audit and clean (30 minutes)
Review main `index.ts` and remove manual exclusions that are no longer needed.

---

## Long-term Vision

### Consider Sub-package Structure
If the core package grows too large, consider splitting:

```
packages/
├── core/              # Core types and constants
├── core-schemas/      # Zod schemas and validators
├── core-calculations/ # Pure functions and math
└── core-samples/      # Sample data and fixtures
```

Each can be versioned independently and imported as needed:
```typescript
import { PublicProfilesRow } from "@repo/core";
import { activityPlanCreateSchema } from "@repo/core-schemas";
import { calculateTSS } from "@repo/core-calculations";
```

This is overkill for now but good to keep in mind as you scale.

---

## Summary

**Current State**: Manual conflict management, missing utils barrel, inconsistent patterns

**Recommended State**: 
- Barrel files at every level
- Namespace exports for organization
- Minimal manual maintenance
- Clear conflict resolution strategy

**Next Steps**:
1. Create `utils/index.ts`
2. Simplify main `index.ts` to use `export *`
3. Add namespace exports
4. Document import patterns
5. Test thoroughly

**Impact**: Less maintenance, better DX, more scalable architecture
