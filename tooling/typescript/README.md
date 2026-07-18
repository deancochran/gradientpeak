# TypeScript strictness ratchet

`strictness-ratchet.mjs` measures compiler diagnostics caused by enabling one high-impact flag at a time. It uses the installed TypeScript compiler API and never parses `tsc` output.

The ratchet discovers workspace packages by requiring `tsconfig.json` and a non-empty `check-types` script together. Either one without the other fails closed, preventing a TypeScript workspace from bypassing coverage by removing its script; config-only/non-TypeScript workspaces with neither are allowed. It also always includes `packages/db/supabase/tsconfig.json`, whose nested type check is wrapped by the DB package script. A malformed or source-empty workspace config fails closed. The explicitly covered Supabase config may be source-empty so a clean checkout without Edge Functions still preserves coverage when a function is added. For each project, the script compares its normal diagnostics with a separate compiler program in which exactly one currently-disabled flag is enabled:

- `exactOptionalPropertyTypes`
- `noImplicitReturns`
- `noUncheckedIndexedAccess`
- `verbatimModuleSyntax`

Only the diagnostic multiset added by that independent run is ratcheted. Project analyses run in isolated Node processes so large, overlapping workspace programs cannot retain one another's compiler graphs.

The compact baseline stores counts in deterministic buckets keyed by flag, project, repository-relative file, and TypeScript diagnostic code. Increasing a bucket or moving debt to another file fails, while line changes and ordinary edits around an existing diagnostic do not churn baseline identity. The tradeoff is that replacing one same-code diagnostic with another in the same file is intentionally treated as unchanged debt; this ratchet controls the amount and location of migration debt rather than reviewing diagnostic-level source identity. The baseline contains no messages, source text, line numbers, or source-derived hashes.

The baseline also persists the exact disabled-flag checks. Enabling a flag removes a check and is accepted as policy strengthening. Disabling a flag, adding a new disabled-flag check, or removing project coverage fails closed. A reviewed baseline update may acknowledge those policy changes explicitly; they are never accepted merely because diagnostic totals happen to fall.

## Commands

Check the baseline:

```sh
node tooling/typescript/strictness-ratchet.mjs
```

Run focused tests:

```sh
node --test tooling/typescript/strictness-ratchet.test.mjs
```

After reviewing all diagnostic changes, rewrite a reduced or equivalent baseline:

```sh
node tooling/typescript/strictness-ratchet.mjs --write-baseline --reviewed
```

Writing requires the explicit `--reviewed` acknowledgement. It refuses malformed baselines, compiler-version changes, bucket growth, and policy weakening. A reviewed compiler upgrade separately requires `--allow-typescript-version-change`:

```sh
node tooling/typescript/strictness-ratchet.mjs --write-baseline --reviewed --allow-typescript-version-change
```

Normal checks always reject a baseline produced by another TypeScript version. During a reviewed update, the old baseline is still compared structurally and bucket-for-bucket with current compiler output before its version is replaced. Intentional bucket growth additionally requires `--allow-debt-increase`. A newly disabled flag/new check or removed project coverage separately requires `--allow-policy-weakening`. Keep all three acknowledgements independent so a compiler upgrade does not silently accept more debt or weaker policy.

## Root integration

Add scripts equivalent to the following in a separately owned root `package.json` change:

```json
{
  "check:typescript-strictness": "node tooling/typescript/strictness-ratchet.mjs",
  "check:typescript-strictness:baseline": "node tooling/typescript/strictness-ratchet.mjs --write-baseline --reviewed",
  "test:typescript-strictness": "node --test tooling/typescript/strictness-ratchet.test.mjs"
}
```

Run the check in the static/CI gate and the focused test in the repository test gate. Do not add broad exclusions to reduce the baseline; fix diagnostics or enable a flag in the owning config, then regenerate the reviewed baseline.
