# Decision Log

## Purpose

Record the key architecture choices that must be settled for the replatform.

## Open Decisions

| Decision | Options | Recommended direction | Status |
| --- | --- | --- | --- |
| API package final name | keep `packages/trpc`; rename to `packages/api`; bridge then rename | bridge if needed, steady-state `packages/api` | open |
| Supabase package final home | keep `packages/supabase`; move to `infra/supabase` | keep only if repo conventions prefer package-local infra | open |
| Drizzle migration strategy | convert legacy history; create forward baseline | pick one explicit authoritative path before implementation | open |
| Better Auth web session model | route/cookie model variants | choose one TanStack Start-native approach early | open |
| Better Auth mobile auth model | direct mobile flow; proxy/callback-assisted flow | choose one Expo-compatible approach early | open |

## Locked Decisions

| Decision | Outcome |
| --- | --- |
| Web framework | TanStack Start |
| API framework | tRPC |
| DB ORM | Drizzle ORM |
| DB platform | Supabase Postgres |
| Auth framework | Better Auth |
| Shared domain package | keep `packages/core` |
| Shared UI package | keep `packages/ui` |
| Shared tooling | `tooling/typescript` and `tooling/tailwind` |
| Lint/format | Biome only |
| Exclusions | no ESLint package, no Prettier package, no long-term Next.js target |

## Completion Condition

- every open decision is either locked or explicitly deferred with a temporary bridge and retirement plan
