# Package Migration Matrix

## Purpose

This matrix maps each major current package or app area to its target owner, migration work, temporary bridge needs, and final retirement outcome.

## Repository-Level Matrix

| Current area | Current role | Target area | Target role | Must migrate | Can stay | Temporary bridge | Final retirement |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `apps/web` | Next.js web app | `apps/web` | TanStack Start web app | routes, providers, SSR helpers, auth bootstrap, `/api/trpc`, `/api/auth` | product UI/features | temporary coexistence with legacy Next code if needed | remove Next runtime code and Next-only helpers |
| `apps/mobile` | Expo app | `apps/mobile` | Expo app | auth bootstrap integration, API client imports, any shared package import changes | Expo Router app structure | compatibility imports if API/auth package names change | remove old auth/bootstrap assumptions tied to Supabase Auth |
| `packages/trpc` | shared tRPC package | `packages/api` with temporary `packages/trpc` bridge | shared API package | context, auth integration, DB integration, package name | router composition concepts, procedure shapes where still valid | `packages/api` now owns shared context while `@repo/trpc` remains the compatibility surface for existing router/client imports | retire the compatibility package after all consumers move to `packages/api` |
| repo manifests + ignore rules | mixed script wrappers and partial generated-output coverage | lean manifests plus repo-wide generated-artifact hygiene | workflow/task surface | custom wrappers that no longer add value, missing ignore rules for generated outputs | essential task names and intentional checked-in manifests | short-lived bridges only where tools require explicit entrypoints | remove obsolete wrapper scripts and keep generated outputs out of git |
| `packages/supabase` | Supabase CLI, SQL migrations, generated types, generated schemas, seeds | retained infra package or `infra/supabase` | Supabase platform-only package | relational schema ownership, app-facing types, app-facing validation, DB seed ownership | CLI config, storage, functions, local stack config | temporary parallel existence while Drizzle becomes authoritative | retire relational source-of-truth role |
| `packages/typescript-config` | shared TS config | `tooling/typescript` | shared TS config tooling | config files, package/app references, docs | config content patterns that still fit | re-export or copied config during transition if needed | retire package-based TS config location |
| `packages/ui` | shared cross-platform UI | `packages/ui` | shared cross-platform UI | web runtime assumptions, Tailwind/tooling references, any Next-only assumptions | cross-platform component ownership | temporary compatibility wrappers if web setup changes | retire Next-specific assumptions |
| `packages/core` | pure domain logic | `packages/core` | pure domain logic | only import-path cleanup if needed | domain logic, schemas, calculations, contracts | none preferred | no retirement; package remains first-class |

## Detailed Package Matrix

### `apps/web`

| Category | Current owner/path | Future owner/path | Action | Notes |
| --- | --- | --- | --- | --- |
| Web runtime | `apps/web` on Next.js | `apps/web` on TanStack Start | replace | canonical web app name stays the same |
| Routing | Next App Router files | TanStack Start file routes | migrate | route-by-route mapping required |
| API mounting | Next route handlers | TanStack Start server endpoints | migrate | includes `/api/trpc` and `/api/auth` |
| Auth bootstrap | Supabase SSR + `trpc.auth` driven | Better Auth driven | rewrite | web cookies/session behavior must be redefined |
| SSR helpers | `next/headers`, `next/navigation`, SSR helpers | TanStack Start request/server equivalents | replace | remove all long-term Next-only APIs |
| UI consumption | shared `@repo/ui` plus web-local wiring | shared `@repo/ui` plus TanStack Start wiring | adapt | shared package should remain framework-agnostic |

### `apps/mobile`

| Category | Current owner/path | Future owner/path | Action | Notes |
| --- | --- | --- | --- | --- |
| Auth bootstrap | mobile session flow aligned with Supabase Auth | mobile session flow aligned with Better Auth Expo integration | migrate | use SecureStore-backed session/cookie caching and preserve Expo-first behavior |
| API client types | `@repo/trpc` | `@repo/api` or temporary bridge | adapt | avoid breaking mobile while rename is in flight |
| Shared contracts | `@repo/core`, `@repo/ui` | same | keep | core and UI stay first-class |
| Web dependency leakage | limited today | none allowed | enforce | mobile must not import TanStack/Next runtime code |
| Authenticated request transport | `Authorization: Bearer <supabase access token>` | manual `Cookie` header from Better Auth Expo client cache | migrate | keep bearer only as a short-lived bridge if required |
| Auth transport scaffold | `lib/supabase/auth-headers.ts` bearer-only helper | `lib/auth/request-auth.ts` cookie-first helper + SecureStore cache | in progress | landed low-risk prep: cookie header cache now wins, bearer remains bridge-only fallback |
| Callback token handling | direct Supabase token parsing in screens | trusted Better Auth callback with bridge-only legacy token handling during migration | in progress | legacy Supabase token parsing is now isolated in `lib/auth/legacy-supabase-bridge.ts` |
| Verification + sign-up UX | Supabase sign-up plus OTP verification/resend screens | Better Auth Expo sign-up plus link-first verification/resend flow | in progress | sign-up and verify now use `authClient`; callback handling still needs final cleanup once web/auth email senders are fully wired |
| Account-management email change | relative callback and password-confirm UI shaped by Supabase Auth | Better Auth change-email flow with mobile deep-link callback | in progress | mobile account management now deep-links back into Expo and drops the stale local password-confirm step |

### `packages/trpc` -> `packages/api`

| Category | Current owner/path | Future owner/path | Action | Notes |
| --- | --- | --- | --- | --- |
| Package name | `packages/trpc` | `packages/api` | migrate then retire bridge | no long-term dual package ownership |
| Context | Supabase-client session lookup | `packages/api` normalized auth session + optional DB context | in progress | initial bridge consumes `packages/auth` session contracts first, with temporary Supabase session fallback for unchanged callers |
| Auth router behavior | `trpc.auth` wraps Supabase Auth | auth behavior moves to `packages/auth` where appropriate | reduce/refactor | some auth-adjacent procedures may remain if still API-oriented |
| Domain routers | current router files | same package boundary | keep/adapt | update DB access layer from Supabase client to Drizzle |
| Client typing | current tRPC client exports | same concept under final package name | keep | keep shared mobile + web API typing |

### `packages/supabase`

| Category | Current owner/path | Future owner/path | Action | Notes |
| --- | --- | --- | --- | --- |
| SQL migrations | `packages/supabase/migrations` | `packages/db` Drizzle migrations | migrate ownership | decide conversion strategy explicitly |
| Generated DB types | `packages/supabase/database.types.ts` | Drizzle schema-derived contracts in `packages/db` | retire as primary source | may remain for platform-specific surfaces only |
| Generated schemas | `packages/supabase/supazod/*` | DB-facing validation in `packages/db` | retire/replace | use Drizzle-derived validation where useful |
| Seed scripts | `packages/supabase/scripts/*` | `packages/db` or dedicated DB scripts | migrate | keep platform-only scripts separate |
| CLI config | `packages/supabase/config.toml` etc. | retained Supabase infra location | keep | platform concern, not ORM concern |
| Edge/storage/platform assets | current Supabase package | retained Supabase infra location | keep | only if still used |

### `packages/db`

| Category | Future owner/path | Responsibility | Source migration | Notes |
| --- | --- | --- | --- | --- |
| Schema | `packages/db/src/schema.ts` or equivalent | canonical relational schema | from Supabase SQL and generated types | Drizzle becomes source of truth |
| Relations | `packages/db/src/relations.ts` or equivalent | relation definitions | new | required for ORM-first ownership |
| Client | `packages/db/src/client.ts` or equivalent | typed DB access | from current Supabase client usage patterns | driver choice should match Supabase setup |
| Migrations | `packages/db/drizzle/*` or equivalent | canonical app schema migration history | from current SQL-first history | explicit policy required |
| Seeds | `packages/db/scripts/*` or equivalent | relational data seeding | from Supabase seed scripts | keep platform seeds separate if needed |
| Validation | `packages/db/src/validation/*` or equivalent | DB-facing schema-derived validation | from Supazod and ad hoc schemas | keep app contracts clean |

### `packages/auth`

| Category | Future owner/path | Responsibility | Source migration | Notes |
| --- | --- | --- | --- | --- |
| Auth runtime | `packages/auth/src/index.ts` or equivalent | Better Auth server config | from `trpc.auth` + web auth glue | primary auth boundary; current slice starts with contracts and env parsing |
| Providers/plugins | `packages/auth/src/providers/*` or equivalent | web/mobile auth plugins | new or adapted | Expo compatibility matters; keep first-party auth email/password-first |
| Session helpers | `packages/auth/src/session/*` or equivalent | session lookup, cookie helpers | from current Supabase session logic | shared by web and API; mobile keeps bearer transport with Better Auth as issuer |
| CLI/schema generation | `packages/auth/scripts/*` or equivalent | Better Auth generation if used | new | should feed `packages/db` |
| Deep-link/callback logic | package helpers + web route integration | verification/reset/mobile callback rules | from current auth redirect handling | must be audited before cutover; web-first callback then safe redirect |
| Account deletion contract | `packages/auth/src/contracts/account-deletion.ts` or equivalent | auth removal plus app-specific cleanup orchestration | from current auth mutation and mobile delete-account RPC behavior | no blind hard-delete |

### `packages/ui`

| Category | Current role | Future role | Action | Notes |
| --- | --- | --- | --- | --- |
| Shared components | cross-platform UI primitives and components | same | keep | package remains first-class |
| Web assumptions | some current wiring aligned to Next web app | TanStack Start compatible web usage | adapt | keep framework specifics out of shared code |
| Tailwind/theme inputs | local/shared mixed setup | `tooling/tailwind` backed shared setup | migrate | align package with final tooling layout |

### `packages/core`

| Category | Current role | Future role | Action | Notes |
| --- | --- | --- | --- | --- |
| Domain logic | pure business logic, contracts, calculations | same | keep | no DB/auth/web runtime imports allowed |
| Shared schemas/contracts | app-shared contracts | same | keep | remains stable across architecture change |
| Import boundaries | mostly clean | must remain clean | enforce | no Drizzle, Better Auth, Supabase runtime, Next, or TanStack runtime imports |

### `tooling/typescript`

| Category | Source | Future role | Action | Notes |
| --- | --- | --- | --- | --- |
| Shared TS base config | `packages/typescript-config` | root tooling package | migrate | update all consumers |
| TS references/docs | current package references | tooling references | update | include scripts and package docs |

### `tooling/tailwind`

| Category | Source | Future role | Action | Notes |
| --- | --- | --- | --- | --- |
| Shared Tailwind/theme config | duplicated or app-local setup | root tooling package | centralize | supports web and shared UI styling needs |
| Theme tokens | current mixed ownership | shared tooling ownership | centralize | align with `packages/ui` consumption |

### Repo manifests + ignore rules

| Category | Current role | Future role | Action | Notes |
| --- | --- | --- | --- | --- |
| Root/app/package scripts | mixed direct commands plus convenience wrappers | lean task entrypoints only | reduce | prefer Turbo tasks and tool-native commands where possible |
| Generated output ignore rules | partial coverage focused on current frameworks | repo-wide generated artifact policy | expand | include TanStack Start-era caches, reports, build outputs, and machine-local runtime folders |

## Temporary Bridge Policy

- `packages/api` should become the steady-state owner first through shared context and package exports, while `packages/trpc` stays as the temporary compatibility package until app imports move.
- `packages/typescript-config` may temporarily point consumers to `tooling/typescript` during migration, but should not remain the permanent home.
- `packages/supabase` may temporarily coexist with `packages/db`, but only with an explicit plan to remove relational source-of-truth ownership from it.
- wrapper scripts should only survive where a tool requires an explicit entrypoint or the repo truly benefits from a stable alias.
- no permanent dual ownership is allowed for auth or relational schema.

## Final Retirement Matrix

| Legacy area | Retirement trigger | Retirement action |
| --- | --- | --- |
| Next.js runtime code in `apps/web` | TanStack Start fully serves the web app | remove Next-only code and dependencies |
| Supabase-Auth-first router behavior | Better Auth fully owns auth lifecycle | remove or reduce old router auth behavior |
| Supabase-generated relational type ownership | Drizzle is authoritative and consumers are migrated | retire as primary app contract |
| `packages/typescript-config` as config home | all consumers use `tooling/typescript` | remove or leave only a short-lived compatibility shim |
| temporary `packages/trpc` bridge if final name is `packages/api` | all consumers import final API package | remove compatibility bridge |
| obsolete wrapper scripts and partial ignore rules | tooling/task graph is simplified and generated outputs are covered | remove wrappers and lock repo hygiene rules |
