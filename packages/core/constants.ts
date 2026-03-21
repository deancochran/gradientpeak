/**
 * Compatibility facade for focused constants modules.
 *
 * Prefer importing from narrower modules under `@repo/core/constants/*` when
 * touching callers, but keep this surface stable during migration.
 */

export * from "./constants/index";
