# Plan

1. Remove mobile package and tsconfig references to `@repo/db`.
2. Migrate `packages/db/src/validation/index.ts` and `packages/db/package.json` to `drizzle-orm/zod`.
3. Inspect remaining direct mobile Supabase usage and replace the safest paths with existing `@repo/api` or local auth-adapter seams.
4. Verify targeted typechecks/tests for mobile and db/api packages touched.
5. Record remaining blockers and next bounded follow-up slices.
