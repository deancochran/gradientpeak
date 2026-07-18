# Filesystem-driven test planning

The test planner derives scope from repository paths and filename suffixes. It has no runtime
dependencies and does not import product code or execute TypeScript metadata.

## Commands

Plan without executing:

```sh
pnpm test:scope -- --path packages/core/activity-plan
pnpm test:scope -- --feature activity-plan
pnpm test:scope -- --changed
pnpm test:scope -- --changed --base origin/main
pnpm test:scope -- --feature activity-plan --json
```

The focused test scripts execute static tests while preserving package ownership:

```sh
pnpm test:file packages/core/activity-plan-calculations.test.ts
pnpm test:feature activity-plan
pnpm test:changed
pnpm verify:feature activity-plan
pnpm verify:changed
```

`test:file`, `test:feature`, and `test:changed` pass `--run` to the planner. `verify:feature` and
`verify:changed` pass `--verify`: they run selected tests first, then `check-types` for every
workspace owner represented by any discovered source or test file and `check:testing-artifacts`
when `@repo/ui` is represented. For example, a feature with web source and only Core tests runs
both the web and Core typechecks. The planner spawns argument arrays directly; it does not build
shell command strings. Runtime tests are shown but deferred unless `--runtime` is explicit:

```sh
pnpm test:scope -- --feature activity-plan --run --runtime
```

`--plan` may be passed explicitly, but plan-only is the CLI default. An empty path or feature is
allowed while planning so a feature can adopt the convention incrementally. The same empty
selection fails clearly with `--run` or `--verify` rather than reporting a misleading success.
Changed execution is different: by default, when no changed file selects a test or verification
command, it prints `No tests selected` and exits successfully. `--strict` may be combined only with
`--changed --run` or `--changed --verify`; it fails if changed production/configuration files under
a known app, package, tooling tree, or recognized root configuration yield neither tests nor
verification commands. Changed tests, stories, `tooling/**/fixtures`, and Markdown are not treated
as uncovered production/configuration. Thus an irrelevant docs-only change remains a successful
empty strict plan. Any execution selection containing tests but only deferred runtime tests fails
and asks for explicit `--runtime`; verification checks cannot substitute for test execution.

## Canonical feature layout

A feature id is lowercase kebab case with nonempty letter/number segments separated by single
hyphens (for example, `activity-plan`, not `activity--plan`) and is repeated at any applicable
layer:

```text
packages/core/src/features/<id>/
packages/api/src/features/<id>/
apps/web/src/features/<id>/
apps/mobile/features/<id>/
apps/web/e2e/features/<id>.spec.ts
apps/mobile/.maestro/features/<id>.yaml
```

Selecting any path inside a canonical feature directory expands to the same id across every
root. A changed file inside one of those directories does the same. Outside canonical feature
roots, selecting a directory finds tests below it; selecting a source file finds conventionally
named tests recursively in its containing directory or capsule. This intentionally makes shared
entrypoints such as `index.ts` and `shared.ts` select the entire local test capsule. Repository-root
files never use the repository itself as a capsule. Test-infrastructure files (`package.json`,
`turbo.json`, `pnpm-workspace.yaml`, `biome.json`, and `vitest.parity.config.ts`) select finite
testing/architecture Node-test and parity capsules as appropriate. Arbitrary root files select no
tests.

Features may also adopt the convention incrementally by placing `.feature-id` in an applicable
noncanonical directory below `apps/` or `packages/`. The directory basename must exactly equal the
declared id. Markers are forbidden at or above a canonical feature root and anywhere inside an
existing canonical feature instance, which already gets feature grouping from its path. The marker
is inert UTF-8 text: its entire contents must be one valid lowercase kebab feature id with at most
one trailing newline. It is never imported or executed. All marked directories and canonical roots
with the same id are grouped by `--feature`. Path and changed selection use the nearest ancestor
marker, including for a deleted descendant while its ancestor marker remains. Nested marker
declarations (duplicate or conflicting), basename mismatches, malformed/non-UTF-8 markers, and
symlink markers are rejected. Discovery does not follow symlink directories and retains the
repository real-path containment checks. `--all` and direct root-file selections skip the marker
inventory because those selectors cannot use marker grouping.

## Filename classification

Classification is most-specific-first:

| Suffix or path | Kind | Default runner |
| --- | --- | --- |
| `*.test.ts`, `*.test.tsx` | unit | package Vitest script |
| `*.web.test.ts(x)` | web | package web/Vitest script |
| `*.native.test.ts(x)`, `*.jest.test.ts(x)` | native | package Jest script |
| `*.contract.test.ts(x)` | contract | package Vitest script |
| `*.live-db.test.ts(x)` | live-db | API live-DB script |
| `apps/web/e2e/**/*.spec.ts` | Playwright | web `test:e2e` |
| `apps/mobile/.maestro/features/*.yaml` | Maestro | mobile `test:e2e:flow` |
| `apps/mobile/.maestro/flows/{smoke,performance}/**/*.yaml` | Maestro | mobile `test:e2e:flow` |

The equivalent `*.spec.*` suffixes are accepted for unit, web, native, contract, and live-DB tests.
Live-DB, Playwright, and Maestro commands are runtime work and require `--runtime`; the default
execution path remains fast and static.
Reusable, `main`, and retained `journeys` Maestro YAML files are dependencies or historical assets,
not independently runnable scenarios, and are not classified as tests.

## Optional feature intent

`feature.contract.ts` may be placed directly in a canonical `<id>` directory as future typed
intent metadata. The planner reports the file as structural evidence only. It never imports,
transpiles, or evaluates arbitrary TypeScript. Tests and runtime files remain the primary
machine-readable evidence until a separate safe contract parser and schema are introduced.

## Shared UI structure ratchet

`pnpm check:test-structure` validates each immediate directory under
`packages/ui/src/components`:

- Paired `index.web.tsx` and `index.native.tsx` implementations require paired
  `index.web.test.tsx` and `index.native.test.tsx` tests. The `.ts` equivalents are accepted.
- A web-only implementation requires an empty regular `.web-only` file in its component directory.
- A native-only implementation requires an empty regular `.native-only` file in its component
  directory.
- A marker that disagrees with the implementations is contradictory and always fails.
- A nonempty marker or a marker that is not a regular file is contradictory and always fails.

Current migration debt is recorded as stable finding IDs in
`tooling/testing/structure-baseline.json`. The default check fails new findings and stale resolved
IDs: adding tests or the correct marker requires refreshing the baseline in the
same change. The writer validates and reads the existing version-1 baseline, refuses hard or new
findings, and writes only current accepted IDs so resolved debt is removed automatically. Missing,
null, malformed, unsorted, duplicate, or otherwise invalid baselines are refused. Refresh after
intentionally resolving debt:

```sh
pnpm check:test-structure:baseline
# equivalent low-level command:
node tooling/testing/cli.mjs --write-structure-baseline
```

The structure check runs once through root `check`/`check:ci`, and therefore once in `quality:agent`.
The package native Jest configuration likewise collects both `*.native.test.ts` and
`*.native.test.tsx`. Web and native story-surface guards recognize both `index.<platform>.ts` and
`index.<platform>.tsx`, matching the structure checker. UI ownership guards recursively inventory
production `.ts`/`.tsx` files and exclude tests, stories, and generated files before comparing the
current approved app-owned lists.

## Migration and limitations

- Existing tests do not need to move. Path selection still works for current directories and
  colocated files; cross-layer feature expansion begins when files adopt canonical feature roots.
- Renaming a test to a specific suffix changes its runner classification. Prefer the narrowest
  truthful suffix instead of configuration entries.
- Changed selection uses NUL-delimited `git diff --name-only -z` plus NUL-delimited untracked-file
  discovery, so repository paths containing newlines remain one path. With `--base`, it also
  includes commits in `<base>...HEAD`. Deleted paths are retained so deleting one canonical feature
  file still expands and tests the remaining files for that feature; deleted non-feature files
  cannot contribute sibling discovery.
- The planner maps known workspace owners (`core`, `api`, `auth`, `db`, `ui`, `web`, and `mobile`).
  Auth uses its Vitest script. Self-running `packages/db/scripts/*.test.ts` files each use
  `pnpm --filter @repo/db exec tsx`; focused DB tests never call the aggregate DB `test` script.
  Core focused tests use `pnpm --filter @repo/core exec vitest run` so they always terminate.
  Other roots fall back to root Vitest. Top-level `tooling/architecture/*.test.mjs` and
  `tooling/testing/*.test.mjs` use `node --test`.
- Files under `tooling/**/fixtures` are never classified as executable tests during capsule or
  `--all` discovery.
- `--all` scans `packages/`, `apps/`, `tooling/`, and the root `tests/` tree; parity files under
  `tests/parity` retain the root parity runner mapping.
- Direct symlink selections are rejected, real paths must remain inside the repository, and
  recursive discovery never follows symlink directories.
- Runtime commands assume their application, database, device, and credentials are already
  prepared. Planning does not provision those dependencies.
- This foundation does not enforce coverage completeness or infer dependencies from imports.
