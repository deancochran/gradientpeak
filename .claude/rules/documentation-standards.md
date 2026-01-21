# Documentation Standards for GradientPeak

## Documentation Philosophy

- **Code should be self-documenting** - Clear names and structure over excessive comments
- **Document "why" not "what"** - Code shows what it does; comments explain why
- **Keep documentation close to code** - Co-located docs stay updated
- **Update docs with code changes** - Stale docs are worse than no docs
- **Write for humans** - Clear, concise, helpful

## Documentation Hierarchy

### 1. Code Comments (Inline)
**When to use**: Complex logic, non-obvious decisions, gotchas

```typescript
// ✅ GOOD - Explains why
// Use 30-second rolling average per Dr. Coggan's power profiling
const rollingAverage = calculateRollingAverage(powerData, 30);

// ✅ GOOD - Warns about gotcha
// IMPORTANT: Must call cleanup() or will leak event listeners
export class ActivityRecorder {
  cleanup() { /* ... */ }
}

// ❌ BAD - States the obvious
// Set the name variable to the user's name
const name = user.name;
```

### 2. JSDoc Comments (Functions/Classes)
**When to use**: Public APIs, exported functions, complex types

```typescript
/**
 * Calculates Training Stress Score (TSS) for an activity.
 *
 * TSS quantifies training load based on intensity and duration.
 * Formula: TSS = (duration × normalizedPower × IF) / (FTP × 3600) × 100
 *
 * @param params - Calculation parameters
 * @param params.normalizedPower - 30-second rolling average power (watts)
 * @param params.duration - Workout duration (seconds)
 * @param params.ftp - Functional Threshold Power (watts)
 * @returns Training Stress Score (0-300+ typical range)
 *
 * @example
 * ```typescript
 * const tss = calculateTSS({
 *   normalizedPower: 250,
 *   duration: 3600, // 1 hour
 *   ftp: 250,
 * });
 * console.log(tss); // 100
 * ```
 *
 * @see {@link https://www.trainingpeaks.com/blog/what-is-tss/}
 */
export function calculateTSS(params: TSSParams): number {
  // Implementation
}
```

### 3. README Files (Package/Feature Level)
**When to use**: Package overview, setup instructions, feature documentation

### 4. CLAUDE.md (Project Level)
**When to use**: Architecture decisions, development patterns, project overview

## README Structure

### Package README Template
```markdown
# Package Name

Brief description of what this package does (1-2 sentences).

## Installation

\`\`\`bash
pnpm add @repo/package-name
\`\`\`

## Usage

\`\`\`typescript
import { functionName } from '@repo/package-name';

const result = functionName(params);
\`\`\`

## API Reference

### `functionName(params)`

Description of function.

**Parameters:**
- `params.param1` (type) - Description
- `params.param2` (type) - Description

**Returns:** type - Description

**Example:**
\`\`\`typescript
const result = functionName({ param1: 'value', param2: 123 });
\`\`\`

## Development

\`\`\`bash
# Run tests
pnpm test

# Type check
pnpm check-types

# Build
pnpm build
\`\`\`

## License

MIT
```

### Feature README Template (e.g., `components/recording/README.md`)
```markdown
# Recording Components

Components for the activity recording flow.

## Components

### RecordingFooter
Main footer component with start/pause/stop controls.

**Props:**
- `service` (ActivityRecorderService) - Recording service instance
- `onFinish` (() => void) - Callback when recording finished

**Example:**
\`\`\`tsx
<RecordingFooter
  service={service}
  onFinish={() => router.push('/submit')}
/>
\`\`\`

### RecordingZones
Displays current training zone and zone distribution.

[Additional components...]

## Architecture

The recording UI is split into three main areas:
1. **Zones (top)** - Current zone and live metrics
2. **Map/Charts (middle)** - Route map or metric charts
3. **Footer (bottom)** - Controls and session stats

## State Management

All recording components use hooks from `lib/hooks/useActivityRecorder.ts`:
- `useRecordingState` - Recording state (pending/ready/recording/paused/finished)
- `useCurrentReadings` - Live sensor data (1-4Hz updates)
- `useSessionStats` - Aggregated statistics

See [useActivityRecorder.ts](../../lib/hooks/useActivityRecorder.ts) for full API.
```

## JSDoc Standards

### Required JSDoc Elements
1. **Description** - What the function does
2. **@param** - Each parameter with type and description
3. **@returns** - Return type and description
4. **@example** - At least one usage example

### Optional JSDoc Elements
- **@throws** - If function throws specific errors
- **@see** - Links to related documentation
- **@deprecated** - If function is deprecated
- **@since** - Version when added (for libraries)

### JSDoc Examples

**Simple Function:**
```typescript
/**
 * Formats duration in seconds to HH:MM:SS or MM:SS format.
 *
 * @param seconds - Duration in seconds
 * @returns Formatted duration string
 *
 * @example
 * ```typescript
 * formatDuration(3665); // "1:01:05"
 * formatDuration(125);  // "2:05"
 * ```
 */
export function formatDuration(seconds: number): string {
  // Implementation
}
```

**Complex Function:**
```typescript
/**
 * Calculates training zones based on threshold values.
 *
 * Supports multiple zone models:
 * - Coggan (7 zones) - Standard power-based zones
 * - Polarized (3 zones) - Low/Moderate/High intensity
 *
 * @param params - Zone calculation parameters
 * @param params.ftp - Functional Threshold Power (watts), optional
 * @param params.maxHeartRate - Maximum heart rate (bpm), optional
 * @param params.model - Zone model to use
 * @returns Training zones for power and/or heart rate
 *
 * @throws {Error} If neither FTP nor max heart rate provided
 *
 * @example
 * ```typescript
 * const zones = calculateTrainingZones({
 *   ftp: 250,
 *   maxHeartRate: 190,
 *   model: 'coggan',
 * });
 *
 * console.log(zones.powerZones); // 7 zones
 * console.log(zones.heartRateZones); // 5 zones
 * ```
 *
 * @see {@link https://www.trainingpeaks.com/blog/power-training-levels/}
 */
export function calculateTrainingZones(params: ZoneParams): TrainingZones {
  // Implementation
}
```

**React Component:**
```typescript
/**
 * Displays an activity card with summary information.
 *
 * Shows activity name, type, distance, duration, and optional stats.
 * Supports tap to view details.
 *
 * @param props - Component props
 * @param props.activity - Activity data to display
 * @param props.onPress - Optional callback when card is tapped
 * @param props.showStats - Whether to show detailed stats (default: false)
 *
 * @example
 * ```tsx
 * <ActivityCard
 *   activity={activity}
 *   onPress={(id) => router.push(`/activity/${id}`)}
 *   showStats
 * />
 * ```
 */
export function ActivityCard({
  activity,
  onPress,
  showStats = false,
}: ActivityCardProps) {
  // Implementation
}
```

**Custom Hook:**
```typescript
/**
 * Hook for managing activity recorder service lifecycle.
 *
 * Creates ActivityRecorder instance scoped to component lifecycle.
 * Automatically cleans up when component unmounts.
 *
 * IMPORTANT: Only use in recording screen - service is expensive to create.
 *
 * @param profile - User profile with FTP and max heart rate
 * @returns ActivityRecorder service instance
 *
 * @example
 * ```tsx
 * function RecordingScreen() {
 *   const profile = useProfile();
 *   const service = useActivityRecorder(profile);
 *   const state = useRecordingState(service);
 *
 *   return <RecordingUI service={service} state={state} />;
 * }
 * ```
 */
export function useActivityRecorder(profile: Profile): ActivityRecorderService {
  // Implementation
}
```

## Code Comments

### When to Add Comments

**DO comment:**
- ✅ Complex algorithms or logic
- ✅ Performance optimizations
- ✅ Workarounds for bugs/limitations
- ✅ Non-obvious side effects
- ✅ Security considerations
- ✅ Business logic rationale

**DON'T comment:**
- ❌ Obvious code
- ❌ What the code does (code should be clear)
- ❌ Commented-out code (delete it)
- ❌ Change logs (use git)

### Comment Examples

**Good Comments:**
```typescript
// Calculate 30-second rolling average per Dr. Coggan's power profiling methodology
const normalizedPower = calculateRollingAverage(powerData, 30);

// HACK: React Native's FlatList doesn't support flex-grow, using height calculation instead
const listHeight = windowHeight - headerHeight - footerHeight;

// SECURITY: Validate user owns activity before allowing deletion
if (activity.userId !== user.id) {
  throw new Error('Unauthorized');
}

// Performance: Memoize expensive calculation to avoid re-computing on every render
const zones = useMemo(() => calculateZones(ftp), [ftp]);
```

**Bad Comments:**
```typescript
// ❌ BAD - States the obvious
// Set the name variable
const name = user.name;

// ❌ BAD - Should delete commented code
// const oldCalculation = power * 0.95;
const newCalculation = power * ftp * 1.05;

// ❌ BAD - Use git for change logs
// Changed by John on 2024-01-15: Updated calculation
// Changed by Jane on 2024-02-03: Fixed edge case
const result = calculate();
```

### TODO Comments
```typescript
// TODO: Add support for swimming cadence
// TODO(username): Optimize this query - currently slow for large datasets
// TODO: [Issue #123] Implement pagination for activity list
// FIXME: Memory leak when recording for >2 hours
// HACK: Temporary workaround until React Native fixes #45678
```

## Type Documentation

### Documenting Complex Types
```typescript
/**
 * Activity plan step with target metrics and progression rules.
 */
export interface ActivityPlanStep {
  /** Unique identifier for this step */
  id: string;

  /** Step name (e.g., "Warm-up", "Main Set", "Cool-down") */
  name: string;

  /** Target duration in seconds */
  targetDuration: number;

  /** Target distance in meters (optional) */
  targetDistance?: number;

  /** Target power zone (1-7 for Coggan model) */
  targetPowerZone?: number;

  /** Target heart rate zone (1-5) */
  targetHeartRateZone?: number;

  /**
   * How to advance to next step.
   * - "manual" - User must manually advance
   * - "time" - Auto-advance when targetDuration reached
   * - "distance" - Auto-advance when targetDistance reached
   */
  advanceCondition: 'manual' | 'time' | 'distance';
}
```

## README Maintenance

### When to Update README
- ✅ Adding new public functions/components
- ✅ Changing function signatures
- ✅ Adding new features
- ✅ Deprecating functionality
- ✅ Changing setup/installation steps

### README Quality Checklist
- [ ] Installation instructions are current
- [ ] All public APIs are documented
- [ ] Examples actually work (test them!)
- [ ] Links are not broken
- [ ] Screenshots are up-to-date (if applicable)
- [ ] Common issues are addressed

## CLAUDE.md Updates

### When to Update CLAUDE.md
Major architectural changes that affect how Claude Code should work:
- New package added to monorepo
- New development pattern adopted
- Architecture decision made
- Testing framework changed
- Build tooling updated

### CLAUDE.md Sections to Keep Updated
1. **Project Overview** - High-level architecture changes
2. **Monorepo Structure** - New packages or reorganization
3. **Common Commands** - New scripts or command changes
4. **Important Patterns** - New patterns to follow
5. **Critical Don'ts** - New pitfalls to avoid

## API Documentation

### tRPC Router Documentation
```typescript
/**
 * Activities router - CRUD operations and analytics for activities.
 *
 * All procedures require authentication except `list` (which filters to user's activities).
 */
export const activityRouter = router({
  /**
   * List activities with optional filtering and pagination.
   *
   * @returns Array of activities sorted by startTime descending
   *
   * @example
   * ```typescript
   * const activities = await trpc.activities.list.query({
   *   limit: 20,
   *   offset: 0,
   *   type: 'run',
   * });
   * ```
   */
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
      type: z.enum(['run', 'bike', 'swim', 'other']).optional(),
    }))
    .query(async ({ input, ctx }) => {
      // Implementation
    }),

  // More procedures...
});
```

## Documentation Tools

### TypeDoc (Future)
For generating API documentation from JSDoc comments:
```bash
# Generate TypeDoc documentation
pnpm run docs:generate

# Serve docs locally
pnpm run docs:serve
```

### Storybook (Future - for component docs)
For documenting React components with interactive examples.

## Markdown Standards

### Formatting
- Use **bold** for emphasis
- Use *italics* for terms
- Use `code` for inline code, filenames, commands
- Use ```language for code blocks
- Use > for important notes/quotes

### Code Blocks
````markdown
```typescript
// Always specify language
const example = "code here";
```

```bash
# Use bash for shell commands
pnpm install
```

```tsx
// Use tsx for React components
export function Component() {
  return <div>Hello</div>;
}
```
````

### Links
```markdown
[Link text](https://example.com)
[Link to file](./relative/path/to/file.ts)
[Link to section](#section-heading)
```

### Lists
```markdown
- Unordered list item
- Another item
  - Nested item

1. Ordered list item
2. Another item
   1. Nested item
```

### Tables
```markdown
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
```

## Documentation Review Checklist

Before committing documentation changes:

- [ ] **Accuracy** - Information is correct and current
- [ ] **Completeness** - All necessary information included
- [ ] **Clarity** - Easy to understand for target audience
- [ ] **Examples** - Working code examples included
- [ ] **Formatting** - Proper markdown, code blocks, etc.
- [ ] **Links** - All links work and point to correct locations
- [ ] **Spelling/Grammar** - No typos or grammatical errors
- [ ] **Consistency** - Follows project documentation standards

## Common Documentation Patterns

### Deprecation Notice
```typescript
/**
 * @deprecated Use `calculateTSS` instead. This function will be removed in v2.0.
 *
 * Calculates training load using old formula.
 */
export function calculateTrainingLoad(params: LoadParams): number {
  // Implementation
}
```

### Migration Guide
```markdown
## Migrating from v1 to v2

### Breaking Changes

#### ActivityRecorder API

**Before (v1):**
```typescript
const recorder = new ActivityRecorder();
recorder.initialize(profile);
```

**After (v2):**
```typescript
const recorder = new ActivityRecorder(profile);
```

#### Zone Calculation

The `calculateZones` function now requires a zone model parameter.

**Before (v1):**
```typescript
const zones = calculateZones(ftp);
```

**After (v2):**
```typescript
const zones = calculateZones({ ftp, model: 'coggan' });
```
```

### Troubleshooting Section
```markdown
## Troubleshooting

### Recording service not starting

**Symptoms:**
- Service stays in "pending" state
- No GPS signal acquired

**Possible causes:**
1. Location permissions not granted
2. GPS disabled on device
3. No clear view of sky

**Solutions:**
1. Check app permissions in device settings
2. Enable location services
3. Go outside or near window
```

## Critical Documentation Don'ts

- ❌ Don't leave TODOs in production docs
- ❌ Don't include commented-out code in examples
- ❌ Don't use screenshots of code (use actual code blocks)
- ❌ Don't copy-paste outdated documentation
- ❌ Don't document internal/private APIs in README
- ❌ Don't skip examples for complex functions
- ❌ Don't use placeholder text (lorem ipsum, "TODO", etc.)
- ❌ Don't commit broken links

## Documentation as Code

Treat documentation like code:
- **Review** - Docs should be reviewed in PRs
- **Test** - Examples should actually work
- **Update** - Update docs when code changes
- **Version** - Track docs in git with code
- **Quality** - Hold docs to same standards as code
