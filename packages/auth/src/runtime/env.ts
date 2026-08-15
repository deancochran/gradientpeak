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

const exactTrustedOriginSchema = z
  .string()
  .trim()
  .url()
  .transform((value, context) => {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname ||
      value.includes("*") ||
      value.includes("?") ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Trusted origins must be exact HTTP(S) origins without wildcards, credentials, paths, queries, or fragments",
      });
      return z.NEVER;
    }
    return parsed.origin;
  });

export function parseAuthRuntimeEnv(input: AuthRuntimeEnv) {
  return authRuntimeEnvSchema.parse(input);
}

export function parseAuthTrustedOrigins(input?: string): string[] {
  if (!input?.trim()) return [];
  return Array.from(
    new Set(
      input
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => exactTrustedOriginSchema.parse(value)),
    ),
  );
}

export function resolveDevelopmentAuthTrustedOrigins(
  nodeEnv: string | undefined,
  configuredOrigins: string | undefined,
  defaults: readonly string[] = [],
): string[] {
  if (nodeEnv !== "development") return [];
  return Array.from(new Set([...parseAuthTrustedOrigins(configuredOrigins), ...defaults]));
}
