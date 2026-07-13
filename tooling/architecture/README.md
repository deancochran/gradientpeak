# Architecture report and baseline

`pnpm check:architecture` scans tracked source with the TypeScript compiler API. It reports existing
architecture debt but fails only when a fingerprint is absent from the reviewed baseline. Unsafe
production typing (`any`, `as any`, `@ts-ignore`, and non-null assertions) is count-based so edits do
not churn fingerprints; any category growth fails.

## Ownership and generated files

Workspace roots, dependency directions, verification coverage, generated freshness owners, DB/Core
enum mappings, and reviewed exceptions are declared in `architecture.config.json`. Add a root there
when introducing a workspace or a tracked config/test location. Generated files must have a named
owner and a deterministic freshness command. In particular, `apps/web/src/routeTree.gen.ts` is owned
by the TanStack router build (`pnpm --filter web build`); it is typechecked but intentionally excluded
from Biome formatting.

Every tracked non-binary file must resolve to the most-specific workspace owner and at least one
verification category with a command. Workspace manifests are discovered from `apps/*`, `packages/*`,
and `tooling/*`, so adding a package without ownership fails. Deliberately unverified files require a
reviewed ignore with owner, reason, and expiry.

Coverage entries resolve to real package scripts. TypeScript sources must be included by the declared
tsconfig, and test files must match a declared runner pattern owned by a package with a test script.
Consequently, adding tests to a package without a test command fails even if a broad repository glob
would otherwise match.

Exceptions require a narrow category/path and a public-safe reason. Use them only for deliberate
platform or persistence distinctions, not to hide unreviewed debt. Enum mappings can declare
`allowedDbOnly` or `allowedCoreOnly` values with a reason when normalization is intentional.
Exceptions and reviewed ignores also require an accountable owner and expiry; exceptions must bind
to one fingerprint or an exact-path maximum count.

The gate compares policy and debt to the Git merge base. It rejects added debt, wider exceptions,
missing exception metadata, removed ownership, and weaker verification coverage even if the working
baseline was regenerated. The first change that introduces these files is treated as a bootstrap.
After review, CI may set `ARCHITECTURE_REVIEW_APPROVED=1`; the override is ignored unless both `CI=true` and `GITHUB_ACTIONS=true`,
so it cannot bypass local review. CI checkout history must remain available for the comparison.

Generated freshness commands run as part of the gate. The checker snapshots each declared artifact,
restores it if generation reveals staleness, and fails without leaving generated diffs behind.
The UI selector and preview manifests are generated from component fixtures and the preview contract
with `pnpm --filter @repo/ui generate:testing-artifacts`; their check command is the freshness owner.

## Shrinking the baseline

Run the gate normally after a change. Removed debt is allowed automatically. To record an intentional,
reviewed baseline update, run:

```sh
pnpm check:architecture:baseline
pnpm check:architecture
```

Review the JSON diff: it contains only category counts and hashed, path-normalized fingerprints—never
source snippets. Do not update the baseline merely to make a new violation pass. Fixture tests live
beside the checker and prove both rejection and reviewed distinction behavior.
