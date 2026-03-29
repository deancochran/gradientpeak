import { z } from "zod";

export const authSessionTransportSchema = z.enum(["cookie", "bearer"]);

export const authUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  emailVerified: z.boolean(),
});

export const authSessionSchema = z.object({
  sessionId: z.string().min(1),
  user: authUserSchema,
  transport: authSessionTransportSchema,
  bearerToken: z.string().min(1).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const authSessionLookupInputSchema = z.object({
  authorizationHeader: z.string().optional(),
  cookieHeader: z.string().optional(),
  clientType: z.enum(["web", "mobile", "server"]).default("web"),
});

export type AuthSessionTransport = z.infer<typeof authSessionTransportSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
export type AuthSessionLookupInput = z.infer<typeof authSessionLookupInputSchema>;
