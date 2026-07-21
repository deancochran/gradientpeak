import { isAllowedMobileCallbackUrl, sanitizeWebCallbackPath } from "@repo/auth/callbacks";
import { createFileRoute } from "@tanstack/react-router";

import {
  createMobileCallbackTrampolineResponse,
  getAllowedMobileAuthSchemePrefixes,
} from "../../lib/auth/mobile-callback";

const getSafeFallback = (request: Request, value: string | undefined) => {
  const requestUrl = new URL(request.url);
  const safePath = sanitizeWebCallbackPath(value, requestUrl.origin, "/auth/login");
  return new URL(safePath, requestUrl.origin).toString();
};

export const Route = createFileRoute("/auth/open")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuthOpenRequest(request),
    },
  },
});

export function handleAuthOpenRequest(request: Request) {
  const requestUrl = new URL(request.url);
  const nextTarget = requestUrl.searchParams.get("next") ?? undefined;
  const fallbackTarget = getSafeFallback(
    request,
    requestUrl.searchParams.get("fallback") ?? undefined,
  );

  if (
    !nextTarget ||
    !isAllowedMobileCallbackUrl(nextTarget, {
      allowedSchemePrefixes: getAllowedDeepLinkPrefixes(),
      callbackPath: "callback",
    })
  ) {
    return Response.redirect(fallbackTarget, 302);
  }

  const callbackUrl = new URL(nextTarget);
  if (
    callbackUrl.searchParams.get("intent") !== "post-sign-in" ||
    callbackUrl.searchParams.has("token") ||
    callbackUrl.searchParams.has("code")
  ) {
    return Response.redirect(fallbackTarget, 302);
  }

  return createMobileCallbackTrampolineResponse(nextTarget, fallbackTarget);
}

function getAllowedDeepLinkPrefixes() {
  return getAllowedMobileAuthSchemePrefixes();
}
