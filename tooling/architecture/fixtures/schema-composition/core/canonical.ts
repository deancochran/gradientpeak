import { z } from "zod";

export const canonicalCategorySchema = z.enum(["run", "bike"]);
export const canonicalPayloadSchema = z.object({ category: canonicalCategorySchema });
