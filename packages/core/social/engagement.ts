import { z } from "zod";

/** Entity targets persisted by the likes relation. */
export const socialLikeEntityTypeValues = [
  "activity",
  "training_plan",
  "activity_plan",
  "route",
] as const;
export const socialLikeEntityTypeSchema = z.enum(socialLikeEntityTypeValues);
export type SocialLikeEntityType = z.infer<typeof socialLikeEntityTypeSchema>;

/** Entity targets accepted by the comments API. */
export const socialCommentEntityTypeValues = [...socialLikeEntityTypeValues, "event"] as const;
export const socialCommentEntityTypeSchema = z.enum(socialCommentEntityTypeValues);
export type SocialCommentEntityType = z.infer<typeof socialCommentEntityTypeSchema>;
