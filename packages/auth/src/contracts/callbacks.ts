import { z } from "zod";

import type { AuthRuntimeEnv } from "../runtime/env";

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

export interface AuthCallbackUrls {
  callbackUrl: string;
  redirectUrl: string;
}

function normalizeAppUrl(appUrl: string) {
  return appUrl.endsWith("/") ? appUrl : `${appUrl}/`;
}

function normalizeRelativePath(path: string | undefined, fallback: string) {
  if (!path) {
    return fallback;
  }

  return path.startsWith("/") ? path : `/${path}`;
}

function sanitizeWebPath(candidate: string | undefined, appUrl: string, fallbackPath: string) {
  if (!candidate) {
    return fallbackPath;
  }

  if (candidate.startsWith("/")) {
    return candidate;
  }

  try {
    const resolved = new URL(candidate, normalizeAppUrl(appUrl));
    return resolved.origin === new URL(appUrl).origin
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : fallbackPath;
  } catch {
    return fallbackPath;
  }
}

function buildMobilePath(path: string, query?: URLSearchParams) {
  const normalizedPath = path.replace(/^\/+/, "");
  const suffix = query?.size ? `?${query.toString()}` : "";

  return normalizedPath ? `${normalizedPath}${suffix}` : suffix;
}

export function buildMobileCallbackUrl(
  payload: MobileCallbackPayload,
  env: Pick<AuthRuntimeEnv, "mobileScheme" | "mobileCallbackPath">,
) {
  const normalizedPayload = mobileCallbackPayloadSchema.parse(payload);
  const query = new URLSearchParams();

  query.set("intent", normalizedPayload.intent);

  if (normalizedPayload.code) {
    query.set("code", normalizedPayload.code);
  }

  if (normalizedPayload.token) {
    query.set("token", normalizedPayload.token);
  }

  if (normalizedPayload.error) {
    query.set("error", normalizedPayload.error);
  }

  const callbackPath = buildMobilePath(env.mobileCallbackPath, query);

  return `${env.mobileScheme}://${callbackPath}`;
}

export function resolveAuthCallbackRedirect(
  request: AuthCallbackRequest,
  env: Pick<AuthRuntimeEnv, "appUrl" | "loginPath" | "mobileScheme" | "mobileCallbackPath">,
  payload?: MobileCallbackPayload,
) {
  const normalizedRequest = authCallbackRequestSchema.parse(request);
  const fallbackPath = sanitizeWebPath(normalizedRequest.fallback, env.appUrl, env.loginPath);

  if (normalizedRequest.target === "mobile") {
    return buildMobileCallbackUrl(payload ?? { intent: normalizedRequest.intent }, {
      mobileScheme: env.mobileScheme,
      mobileCallbackPath: env.mobileCallbackPath,
    });
  }

  return sanitizeWebPath(normalizedRequest.next, env.appUrl, fallbackPath);
}

export function buildAuthCallbackUrls(
  request: AuthCallbackRequest,
  env: Pick<
    AuthRuntimeEnv,
    "appUrl" | "loginPath" | "webCallbackPath" | "mobileScheme" | "mobileCallbackPath"
  >,
  payload?: MobileCallbackPayload,
): AuthCallbackUrls {
  const normalizedRequest = authCallbackRequestSchema.parse(request);
  const callbackUrl = new URL(
    normalizeRelativePath(env.webCallbackPath, "/auth/confirm"),
    env.appUrl,
  );

  callbackUrl.searchParams.set("intent", normalizedRequest.intent);
  callbackUrl.searchParams.set("target", normalizedRequest.target);
  callbackUrl.searchParams.set(
    "fallback",
    sanitizeWebPath(normalizedRequest.fallback, env.appUrl, env.loginPath),
  );

  if (normalizedRequest.next) {
    callbackUrl.searchParams.set(
      "next",
      sanitizeWebPath(normalizedRequest.next, env.appUrl, normalizedRequest.fallback),
    );
  }

  return {
    callbackUrl: callbackUrl.toString(),
    redirectUrl: resolveAuthCallbackRedirect(normalizedRequest, env, payload),
  };
}

export type AuthCallbackIntent = z.infer<typeof authCallbackIntentSchema>;
export type AuthCallbackTarget = z.infer<typeof authCallbackTargetSchema>;
export type AuthCallbackRequest = z.infer<typeof authCallbackRequestSchema>;
export type MobileCallbackPayload = z.infer<typeof mobileCallbackPayloadSchema>;
