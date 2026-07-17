import { canonicalSportValues } from "@repo/core/schemas/sport";

/**
 * Database-facing view of the Core-owned canonical sport registry. The reference
 * table is seeded from this value; it is not a second category authority.
 */
export const canonicalActivityCategoryDbValues = canonicalSportValues;
