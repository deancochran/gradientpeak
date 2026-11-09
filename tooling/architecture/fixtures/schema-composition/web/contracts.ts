import { z } from "zod";
import { canonicalCategorySchema } from "../core/canonical";

export const duplicateCategorySchema = z.enum(["run", "bike"]);
export const duplicatePayloadSchema = z.object({ category: z.enum(["run", "bike"]) });
export const canonicalCategoryAliasSchema = canonicalCategorySchema;
export const composedCanonicalPayloadSchema = z.object({ category: canonicalCategorySchema });
