import { buildMobileCallbackUrl } from "@repo/auth/callbacks";
import { createFileRoute } from "@tanstack/react-router";

import { getConfiguredAppBaseUrl, getRequestBaseUrl } from "../../lib/app-url";

const DEFAULT_MOBILE_DEEP_LINK = "gradientpeak://sign-in";

function getPublicWebAppUrl(request: Request) {
  return process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? getRequestBaseUrl(request);
}

function extractSchemePrefix(uri: string) {
  const match = uri.match(/^([a-z][a-z0-9+.-]*:\/\/)/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function getAllowedDeepLinkPrefixes() {
  const configuredPrefixes = process.env.AUTH_ALLOWED_DEEP_LINK_PREFIXES?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (configuredPrefixes && configuredPrefixes.length > 0) {
    return configuredPrefixes;
  }

  const envPrefixes = [
    process.env.NEXT_PUBLIC_MOBILE_AUTH_REDIRECT_URI,
    process.env.NEXT_PUBLIC_MOBILE_AUTH_REDIRECT_FALLBACK,
    process.env.NEXT_PUBLIC_MOBILE_REDIRECT_URI,
    process.env.NEXT_PUBLIC_MOBILE_REDIRECT_FALLBACK,
    process.env.EXPO_PUBLIC_REDIRECT_URL,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => extractSchemePrefix(value))
    .filter((value): value is string => Boolean(value));

  return [...new Set(["gradientpeak://", "gradientpeak-dev://", "gradientpeak-prev://", ...envPrefixes])];
}

function getDefaultDeepLinkTarget() {
  return process.env.NEXT_PUBLIC_MOBILE_AUTH_REDIRECT_URI ?? DEFAULT_MOBILE_DEEP_LINK;
}

function getDefaultWebFallback(request: Request) {
  return new URL("/auth/login", getPublicWebAppUrl(request)).toString();
}

function getSafeRedirectTarget(nextParam: string | null) {
  if (!nextParam) return getDefaultDeepLinkTarget();

  const normalizedValue = nextParam.toLowerCase();
  const allowedPrefixes = getAllowedDeepLinkPrefixes();

  if (allowedPrefixes.some((prefix) => normalizedValue.startsWith(prefix))) {
    return nextParam;
  }

  return getDefaultDeepLinkTarget();
}

function getSafeFallbackTarget(request: Request, fallbackParam: string | null) {
  const defaultFallback = getDefaultWebFallback(request);

  if (!fallbackParam) return defaultFallback;

  if (fallbackParam.startsWith("/")) {
    return new URL(fallbackParam, getPublicWebAppUrl(request)).toString();
  }

  try {
    const parsed = new URL(fallbackParam);
    const requestOrigin = new URL(getPublicWebAppUrl(request)).origin;

    if (parsed.origin === requestOrigin) {
      return parsed.toString();
    }
  } catch {
    return defaultFallback;
  }

  return defaultFallback;
}

export const Route = createFileRoute("/auth/confirm")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { searchParams } = new URL(request.url);
        const error = searchParams.get("error");
        const intent = searchParams.get("intent");
        const target = searchParams.get("target");
        const token = searchParams.get("token") ?? undefined;
        const code = searchParams.get("code") ?? undefined;
        const next = getSafeRedirectTarget(searchParams.get("next"));
        const fallback = getSafeFallbackTarget(request, searchParams.get("fallback"));

        if (error) {
          const errorUrl = new URL("/auth/error", getPublicWebAppUrl(request));
          errorUrl.searchParams.set("error", error);
          return Response.redirect(errorUrl, 302);
        }

        if (target === "mobile" && intent) {
          const openUrl = new URL("/auth/open", getPublicWebAppUrl(request));
          openUrl.searchParams.set(
            "next",
            buildMobileCallbackUrl(
              {
                intent: intent as "email-verification" | "password-reset" | "post-sign-in",
                ...(token ? { token } : {}),
                ...(code ? { code } : {}),
                ...(error ? { error } : {}),
              },
              {
                mobileScheme:
                  process.env.EXPO_PUBLIC_APP_SCHEME ?? process.env.APP_SCHEME ?? "gradientpeak",
                mobileCallbackPath: "callback",
              },
            ),
          );
          openUrl.searchParams.set("fallback", fallback);
          return Response.redirect(openUrl, 302);
        }

        if (target === "web") {
          return Response.redirect(
            getSafeFallbackTarget(request, searchParams.get("next") ?? searchParams.get("fallback")),
            302,
          );
        }

        if (searchParams.get("token") || searchParams.get("intent")) {
          const openUrl = new URL("/auth/open", getPublicWebAppUrl(request));
          openUrl.searchParams.set("next", next);
          openUrl.searchParams.set("fallback", fallback);
          return Response.redirect(openUrl, 302);
        }

        const hasLegacySupabaseOtpParams =
          Boolean(searchParams.get("token_hash")) || Boolean(searchParams.get("type"));

        if (hasLegacySupabaseOtpParams) {
          const errorUrl = new URL("/auth/error", getPublicWebAppUrl(request));
          errorUrl.searchParams.set(
            "error",
            "This verification link uses the retired Supabase OTP flow. Request a new email and try again.",
          );
          return Response.redirect(errorUrl, 302);
        }

        const errorUrl = new URL("/auth/error", getPublicWebAppUrl(request));
        errorUrl.searchParams.set("error", "Missing auth callback parameters");
        return Response.redirect(errorUrl, 302);
      },
    },
  },
});
