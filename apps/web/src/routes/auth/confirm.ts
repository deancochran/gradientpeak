import {
  authCallbackIntentSchema,
  buildMobileCallbackUrl,
  isAllowedMobileCallbackUrl,
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

function getDefaultDeepLinkTarget() {
  const configuredTarget = process.env.AUTH_MOBILE_CALLBACK_URL;
  const allowedPrefixes = getAllowedDeepLinkPrefixes();

  if (
    configuredTarget &&
    isAllowedMobileCallbackUrl(configuredTarget, {
      allowedSchemePrefixes: allowedPrefixes,
      callbackPath: "callback",
    })
  ) {
    return configuredTarget;
  }

  const scheme = getPreferredMobileScheme();
  return scheme ? `${scheme}://callback?intent=post-sign-in` : undefined;
}

function getDefaultWebFallback(request: Request) {
  return new URL("/auth/login", getPublicWebAppUrl(request)).toString();
}

function getSafeRedirectTarget(nextParam: string | null) {
  if (
    nextParam &&
    isAllowedMobileCallbackUrl(nextParam, {
      allowedSchemePrefixes: getAllowedDeepLinkPrefixes(),
      callbackPath: "callback",
    })
  ) {
    return nextParam;
  }

  return getDefaultDeepLinkTarget();
}

function getSafeFallbackTarget(request: Request, fallbackParam: string | null) {
  const defaultFallback = getDefaultWebFallback(request);
  const appUrl = getPublicWebAppUrl(request);
  const safeTarget = sanitizeWebCallbackPath(fallbackParam ?? undefined, appUrl, defaultFallback);
  return new URL(safeTarget, appUrl).toString();
}

export async function handleAuthConfirmRequest(request: Request) {
  const { searchParams } = new URL(request.url);
  const error = searchParams.get("error");
  const intent = searchParams.get("intent");
  const parsedIntent = authCallbackIntentSchema.safeParse(intent);
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

  if (intent && !parsedIntent.success) {
    const errorUrl = new URL("/auth/error", getPublicWebAppUrl(request));
    errorUrl.searchParams.set("error", "Invalid auth callback intent");
    return Response.redirect(errorUrl, 302);
  }

  if (target === "mobile" && parsedIntent.success) {
    const mobileScheme = getPreferredMobileScheme();
    if (!mobileScheme) {
      return Response.redirect(fallback, 302);
    }

    const mobileTarget = buildMobileCallbackUrl(
      {
        intent: parsedIntent.data,
        ...(token ? { token } : {}),
        ...(code ? { code } : {}),
      },
      {
        mobileScheme,
        mobileCallbackPath: "callback",
      },
    );
    return createMobileCallbackTrampolineResponse(mobileTarget, fallback);
  }

  if (target === "web") {
    return Response.redirect(
      getSafeFallbackTarget(request, searchParams.get("next") ?? searchParams.get("fallback")),
      302,
    );
  }

  if (searchParams.get("token") || searchParams.get("intent")) {
    return next
      ? createMobileCallbackTrampolineResponse(next, fallback)
      : Response.redirect(fallback, 302);
  }

  const errorUrl = new URL("/auth/error", getPublicWebAppUrl(request));
  errorUrl.searchParams.set("error", "Missing auth callback parameters");
  return Response.redirect(errorUrl, 302);
}

export const Route = createFileRoute("/auth/confirm")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuthConfirmRequest(request),
    },
  },
});
