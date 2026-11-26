import {
  authCallbackQuerySchema,
  buildMobileCallbackUrl,
  sanitizeWebCallbackPath,
} from "@repo/auth/callbacks";
import { createFileRoute } from "@tanstack/react-router";

import { getRequestBaseUrl } from "../../lib/app-url";
import {
  createMobileCallbackTrampolineResponse,
  getAllowedMobileAuthSchemePrefixes,
} from "../../lib/auth/mobile-callback";

function getPublicWebAppUrl(request: Request) {
  return process.env.APP_URL ?? getRequestBaseUrl(request);
}

function getAllowedDeepLinkPrefixes() {
  return getAllowedMobileAuthSchemePrefixes();
}

function getPreferredMobileScheme() {
  return getAllowedDeepLinkPrefixes()[0]?.replace(/:\/\/$/, "");
}

function getDefaultWebFallback(request: Request) {
  return new URL("/auth/login", getPublicWebAppUrl(request)).toString();
}

function getSafeFallbackTarget(request: Request, fallbackParam: string) {
  const defaultFallback = getDefaultWebFallback(request);
  const appUrl = getPublicWebAppUrl(request);
  const safeTarget = sanitizeWebCallbackPath(fallbackParam, appUrl, defaultFallback);
  return new URL(safeTarget, appUrl).toString();
}

function getAuthErrorRedirect(request: Request, error: string) {
  const errorUrl = new URL("/auth/error", getPublicWebAppUrl(request));
  errorUrl.searchParams.set("error", error);
  return Response.redirect(errorUrl, 302);
}

function parseAuthCallbackQuery(searchParams: URLSearchParams) {
  const keys = [...searchParams.keys()];
  if (new Set(keys).size !== keys.length) {
    return undefined;
  }

  const parsed = authCallbackQuerySchema.safeParse(Object.fromEntries(searchParams));
  return parsed.success ? parsed.data : undefined;
}

export async function handleAuthConfirmRequest(request: Request) {
  const { searchParams } = new URL(request.url);
  const callback = parseAuthCallbackQuery(searchParams);

  if (!callback) {
    return getAuthErrorRedirect(request, "Invalid auth callback parameters");
  }

  if (callback.error) {
    return getAuthErrorRedirect(request, callback.error);
  }

  const fallback = getSafeFallbackTarget(request, callback.fallback);

  if (callback.target === "mobile") {
    const mobileScheme = getPreferredMobileScheme();
    if (!mobileScheme) {
      return Response.redirect(fallback, 302);
    }

    const mobileTarget = buildMobileCallbackUrl(
      {
        intent: callback.intent,
        ...(callback.token ? { token: callback.token } : {}),
        ...(callback.code ? { code: callback.code } : {}),
      },
      {
        mobileScheme,
        mobileCallbackPath: "callback",
      },
    );
    return createMobileCallbackTrampolineResponse(mobileTarget, fallback);
  }

  if (callback.target === "web") {
    return Response.redirect(
      getSafeFallbackTarget(request, callback.next ?? callback.fallback),
      302,
    );
  }

  return getAuthErrorRedirect(request, "Invalid auth callback parameters");
}

export const Route = createFileRoute("/auth/confirm")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuthConfirmRequest(request),
    },
  },
});
