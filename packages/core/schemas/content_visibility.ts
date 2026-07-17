import { z } from "zod";

export const CONTENT_VISIBILITY_VALUES = ["private", "followers", "public"] as const;

export const contentVisibilitySchema = z.enum(CONTENT_VISIBILITY_VALUES);

export const defaultContentVisibilitySchema = contentVisibilitySchema.default("private");

export type ContentVisibility = z.infer<typeof contentVisibilitySchema>;

export function contentVisibilityIsPublic(visibility: ContentVisibility): boolean {
  return visibility === "public";
}

export function contentVisibilityIsPrivate(visibility: ContentVisibility): boolean {
  return visibility === "private";
}

export function legacyPrivateFlagToContentVisibility(isPrivate: boolean): ContentVisibility {
  return isPrivate ? "private" : "followers";
}

export function contentVisibilityToLegacyPrivateFlag(visibility: ContentVisibility): boolean {
  return visibility === "private";
}
