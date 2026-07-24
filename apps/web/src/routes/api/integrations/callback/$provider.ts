import { handleOAuthCallback } from "@repo/api/server";
import { db } from "@repo/db/client";
import { createFileRoute } from "@tanstack/react-router";

export async function handleOAuthCallbackRequest({
  params,
  request,
}: {
  params: { provider: string };
  request: Request;
}) {
  const requestUrl = new URL(request.url);
  const searchParams = requestUrl.searchParams;
  const canUseLocalWebFallback = ["127.0.0.1", "localhost"].includes(requestUrl.hostname);
  const fallbackRedirect =
    process.env.NODE_ENV !== "production" &&
    process.env.PROVIDER_OAUTH_TEST_ADAPTER === "1" &&
    searchParams.get("test_return") === "web" &&
    canUseLocalWebFallback
      ? `${requestUrl.origin}/integrations?integration=failed`
      : process.env.NEXT_PUBLIC_MOBILE_REDIRECT_FALLBACK || "gradientpeak://integrations";
  const result = await handleOAuthCallback({
    db,
    code: searchParams.get("code"),
    error: searchParams.get("error"),
    fallbackRedirect,
    provider: params.provider,
    state: searchParams.get("state"),
  });

  return Response.redirect(result.redirectUrl, result.status);
}

export const Route = createFileRoute("/api/integrations/callback/$provider")({
  server: {
    handlers: {
      GET: handleOAuthCallbackRequest,
    },
  },
});
