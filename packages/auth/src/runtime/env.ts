import { z } from "zod";

export const authRuntimeEnvSchema = z.object({
  appUrl: z.string().url(),
  mobileScheme: z.string().min(1),
  loginPath: z.string().min(1).default("/auth/login"),
  webCallbackPath: z.string().min(1).default("/auth/confirm"),
  mobileCallbackPath: z.string().min(1).default("callback"),
});

export type AuthRuntimeEnv = z.infer<typeof authRuntimeEnvSchema>;

export function parseAuthRuntimeEnv(input: AuthRuntimeEnv) {
  return authRuntimeEnvSchema.parse(input);
}
