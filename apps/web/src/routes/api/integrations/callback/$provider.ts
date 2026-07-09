import { appRouter, createApiContext, handleOAuthCallback } from "@repo/api/server";
import { resolveAuthSession } from "@repo/auth/server";
import { db } from "@repo/db/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/integrations/callback/$provider")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const searchParams = new URL(request.url).searchParams;
        const code = searchParams.get("code");
        const state = searchParams.get("state");
        const error = searchParams.get("error");
        const provider = params.provider;
        const ctx = await createApiContext({
          headers: new Headers(request.headers),
          auth: {
            resolveSession: resolveAuthSession,
          },
          db,
        });
        const caller = appRouter.createCaller(ctx);
        const fallbackRedirect =
          process.env.NEXT_PUBLIC_MOBILE_REDIRECT_FALLBACK || "gradientpeak://integrations";
        const result = await handleOAuthCallback({
          caller,
          code,
          error,
          fallbackRedirect,
          provider,
          state,
        });

        return Response.redirect(result.redirectUrl, result.status);
      },
    },
  },
});
