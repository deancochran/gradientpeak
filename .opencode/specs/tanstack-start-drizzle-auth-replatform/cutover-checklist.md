# Cutover Checklist

## Purpose

This checklist defines the final gates required before the replatform can be considered fully complete.

## Architecture Gates

- [ ] `apps/web` runs on TanStack Start in the final web path
- [ ] no long-term Next.js runtime code remains in the canonical web app path
- [ ] the API is exposed through the final tRPC package boundary
- [ ] `packages/api` is the only long-term tRPC package home and the `@repo/trpc` bridge is removed or empty with a dated retirement step
- [ ] `packages/auth` is the long-term owner of auth runtime behavior
- [ ] `packages/db` is the long-term owner of relational schema, migrations, and DB access
- [ ] `packages/core` remains DB-independent and runtime-agnostic
- [ ] `packages/ui` remains shared and does not depend on Next.js runtime behavior
- [ ] shared TS config is owned by `tooling/typescript`
- [ ] shared Tailwind config is owned by `tooling/tailwind`
- [ ] Biome remains the only repo-wide lint/format toolchain
- [ ] package manifests stay lean and only keep scripts that provide real entrypoint value

## Migration Completion Gates

- [ ] all current `trpc.auth` behaviors have a final owner or retirement decision
- [ ] all current Next.js-only files have a migration or deletion decision
- [ ] all current `@repo/supabase` relational type/schema imports have a migration decision
- [ ] all current Supabase client DB query paths in the API layer have a Drizzle migration decision
- [ ] all `packages/typescript-config` consumers have moved or have an explicit short-term bridge
- [ ] all Tailwind/theme config locations have moved or have an explicit short-term bridge
- [ ] all generated build/test/runtime folders and reports have a repo-wide ignore decision

## Cleanup Gates

- [ ] temporary package bridges are removed or have a dated retirement step
- [ ] Supabase no longer owns the relational source of truth
- [ ] old Next.js-specific auth/bootstrap helpers are removed
- [ ] old Supabase-Auth-first router code is removed or intentionally minimized to API-adjacent behavior only
- [ ] final package import paths are updated across apps and packages
- [ ] generated test/build/runtime outputs are ignored repo-wide, including TanStack Start-era outputs

## Validation Gates

- [ ] web can authenticate through Better Auth
- [ ] mobile can authenticate through Better Auth-compatible flows
- [ ] web and mobile both talk to the shared tRPC API package
- [ ] DB access for the app uses `packages/db`
- [ ] no shared package imports web-only runtime code
- [ ] no shared package imports DB/runtime concerns into `packages/core`

## Handoff Gates

- [ ] final package map is documented
- [ ] final migration matrix is accurate
- [ ] final cleanup decisions are documented
- [ ] the architecture can be understood without referring back to the old Next/Supabase-auth-first design
