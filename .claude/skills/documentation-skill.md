# Documentation Skill

**Last Updated**: 2026-01-21
**Version**: 1.0.0
**Maintained By**: Skill Creator Agent

## Core Principles

1. **Code is Self-Documenting** - Clear names reduce need for comments
2. **Document "Why" Not "What"** - Code shows what; comments explain why
3. **Keep Docs Close to Code** - Co-located docs stay updated
4. **Examples Show Reality** - Use actual working code, not pseudo-code
5. **Update Docs with Code** - Stale docs worse than no docs

## Patterns to Follow

### Pattern 1: JSDoc for Public Functions

```typescript
/**
 * Calculates Training Stress Score (TSS) from power data.
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
 *   duration: 3600,
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

### Pattern 2: Type Interface Documentation

```typescript
export interface UseFormMutationConfig<TData, TVariables> {
  /**
   * The async function that performs the mutation.
   * Should throw on error.
   */
  mutationFn: (variables: TVariables) => Promise<TData>;

  /**
   * Query keys to invalidate on success.
   *
   * @example
   * ```typescript
   * invalidateQueries: [
   *   ['activities'], // All activities
   *   ['profile', userId], // Specific profile
   * ]
   * ```
   */
  invalidateQueries?: readonly unknown[][];
}
```

### Pattern 3: README Structure

```markdown
# Package Name

Brief description (1-2 sentences).

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

### \`functionName(params)\`

Description.

**Parameters:**
- \`params.param1\` (type) - Description
- \`params.param2\` (type) - Description

**Returns:** type - Description

**Example:**
\`\`\`typescript
const result = functionName({ param1: 'value' });
\`\`\`

## Development

\`\`\`bash
pnpm test
pnpm check-types
\`\`\`
```

### Pattern 4: Inline Comments (When Needed)

```typescript
// Calculate 30-second rolling average (normalized power)
const rollingAvgs: number[] = [];
for (let i = 0; i < powers.length; i++) {
  const start = Math.max(0, i - 30 + 1);
  const window = powers.slice(start, i + 1);
  const avg = window.reduce((sum, p) => sum + p, 0) / window.length;
  rollingAvgs.push(avg);
}

// IMPORTANT: Must call cleanup() or will leak event listeners
export class ActivityRecorder {
  cleanup() { /* ... */ }
}

// Performance: Memoize expensive calculation
const zones = useMemo(() => calculateZones(ftp), [ftp]);
```

## When to Comment

**DO Comment**:
- ✅ Complex algorithms
- ✅ Performance optimizations
- ✅ Workarounds for bugs
- ✅ Non-obvious side effects
- ✅ Security considerations
- ✅ Business logic rationale

**DON'T Comment**:
- ❌ Obvious code
- ❌ What the code does (code should be clear)
- ❌ Commented-out code (delete it)
- ❌ Change logs (use git)

## Documentation Checklist

- [ ] All public APIs have JSDoc
- [ ] Complex types documented
- [ ] Examples tested and working
- [ ] README up to date
- [ ] No commented-out code
- [ ] Spelling/grammar checked
- [ ] Links not broken

## Related Skills

- [Core Package Skill](./core-package-skill.md) - Function documentation
- [Testing Skill](./testing-skill.md) - Test documentation

## Version History

- **1.0.0** (2026-01-21): Initial version

---

**Next Review**: 2026-02-21
