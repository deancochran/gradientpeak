import { canonicalActivityCategoryValues } from "@repo/core/schemas/activity-category";

/**
 * Database-facing view of the Core-owned canonical activity_category registry. The reference
 * table is seeded from this value; it is not a second category authority.
 */
export const canonicalActivityCategoryDbValues = canonicalActivityCategoryValues;
