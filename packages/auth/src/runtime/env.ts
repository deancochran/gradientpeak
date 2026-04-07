import { z } from "zod";

export const authRuntimeEnvSchema = z.object({
  appUrl: z.string().url(),
  mobileScheme: z.string().min(1),
  loginPath: z.string().min(1).default("/auth/login"),
  webCallbackPath: z.string().min(1).default("/auth/confirm"),
  mobileCallbackPath: z.string().min(1).default("callback"),
  emailMode: z.enum(["smtp", "log", "disabled"]).default("log"),
  emailFrom: z.string().min(1).optional(),
  emailReplyTo: z.string().min(1).optional(),
  smtpHost: z.string().min(1).optional(),
  smtpPort: z.coerce.number().int().positive().optional(),
  smtpUser: z.string().min(1).optional(),
  smtpPass: z.string().min(1).optional(),
  smtpSecure: z
    .union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")])
    .optional(),
});

export type AuthRuntimeEnv = z.infer<typeof authRuntimeEnvSchema>;

export function parseAuthRuntimeEnv(input: AuthRuntimeEnv) {
  return authRuntimeEnvSchema.parse(input);
}
