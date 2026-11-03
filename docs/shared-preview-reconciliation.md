# Shared preview reconciliation checkpoint

## Source and preservation

The shared preview combines the preserved development source with compatible
newer work; it is not a claim of release acceptance. Original recovery checkouts,
uncommitted edits and environment files remain intact.

- Accepted-main starting point: `c7072ca839ca646f9a8db470af26756b8327cbe7`.
- Preserved development candidate: `1d5ac63ab7ad7a89b25bdfd1dec9a63f5b770ce4`.
- Reconciliation bootstrap: `09e12831af0c18f41688024e29075825f2cd611f`.
- Newer reliability source: PR #112 checkpoint `194d3af5ee38469b2072541e343e1b4326b89751`.
- Semantic merge: `e57d53e6e5ea8b1a159f7319956c4d28d83b383e`.

The preserved development candidate retains V5 plans, chatbot, Garmin-local and
recording foundations. Comparing tracked/nonignored dev source against that
candidate found only the documented root policy/README and reanalysis test
repairs; five environment templates were excluded from that comparison.

## Compatible newer changes

- Disable the protected-header navigation trigger before hydration, preserving
  the current header and chatbot composition; include a focused regression test.
- Label the command-dialog input from its title and verify its accessible name.
- Serialize pnpm child jobs for the previously identified hoisted patch/copy race.

The header fix also incorporates the compatible uncommitted PR #112 follow-up.
The ordinary merge records both histories, but does **not** mean every PR #112
implementation or acceptance claim was adopted.

## Exclusions and remaining evidence

- Retain the development candidate's current auth/API, Event/V5 and Expo 57
  contracts rather than replacing them with PR #112's older implementations.
- Do not import legacy migration edits, alternate baseline/acceptance tooling,
  Expo 54 / Metro compatibility patches or their dependency set.
- Do not import old browser-acceptance selector fixes, the associated Ubuntu CI
  pin or status claims without a compatible current acceptance architecture.
- These exclusions are explicit scope decisions, not proof that every older
  reliability scenario passes under the newer architecture.
- The full feature/release gates and physical-device behavior remain separate
  from preview startup. Provider live delivery, paid chatbot evaluation and
  preserved database mutations are not authorized by this integration.

## Evidence at the semantic merge

The worker ran frozen installation without lifecycle scripts, the focused header
test, web and UI typechecks, UI web tests (68 files / 202 tests), scoped Biome,
pre-commit and diff/conflict-marker checks. The existing long Tailwind class
string produced a non-blocking `noSecrets` false-positive warning.

Baseline runtime evidence before the semantic merge: a read-only fingerprint
matched 75 managed database tables; login and current-contract anonymous auth
requests returned HTTP 200; Metro status and iOS manifest responded; an iOS export
produced a 22 MB bundle. This does not establish authenticated user journeys or
installed-native-build compatibility. Exact deployed preview SHA and latest
health remain in the coordination workspace's private activation record, not
this versioned historical report.
