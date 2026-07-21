import { z } from "zod";

export const authRuntimeEnvSchema = z.object({
  appUrl: z.string().url(),
  mobileScheme: z
    .string()
    .regex(/^[a-z][a-z0-9+.-]*$/i, "Mobile scheme must be a bare custom URL scheme")
    .refine(
      (value) =>
        !new Set([
          "about",
          "blob",
          "data",
          "file",
          "http",
          "https",
          "intent",
          "javascript",
          "mailto",
          "tel",
          "vbscript",
        ]).has(value.toLowerCase()),
      "Mobile scheme must not be browser-executable or reserved",
    ),
  loginPath: z.string().min(1).default("/auth/login"),
  webCallbackPath: z.string().min(1).default("/auth/confirm"),
  mobileCallbackPath: z.string().min(1).default("callback"),
  emailMode: z.enum(["smtp", "log", "capture", "disabled"]).default("log"),
  emailCapturePath: z.string().min(1).optional(),
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
