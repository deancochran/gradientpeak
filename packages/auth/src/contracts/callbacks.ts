import { z } from "zod";

export const authCallbackIntentSchema = z.enum([
  "email-verification",
  "password-reset",
  "post-sign-in",
]);

export const authCallbackTargetSchema = z.enum(["web", "mobile"]);

export const authCallbackRequestSchema = z.object({
  intent: authCallbackIntentSchema,
  target: authCallbackTargetSchema,
  next: z.string().min(1).optional(),
  fallback: z.string().min(1),
});

export const mobileCallbackPayloadSchema = z.object({
  intent: authCallbackIntentSchema,
  code: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
});

export type AuthCallbackIntent = z.infer<typeof authCallbackIntentSchema>;
export type AuthCallbackTarget = z.infer<typeof authCallbackTargetSchema>;
export type AuthCallbackRequest = z.infer<typeof authCallbackRequestSchema>;
export type MobileCallbackPayload = z.infer<typeof mobileCallbackPayloadSchema>;
