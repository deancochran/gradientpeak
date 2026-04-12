import { createFileRoute } from "@tanstack/react-router";

const FALLBACK_DELAY_MS = 1500;

const isDeepLink = (value: string) => {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return false;
  return !/^https?:\/\//i.test(value);
};

const getSafeFallback = (request: Request, value: string | undefined) => {
  const requestUrl = new URL(request.url);

  if (!value) return new URL("/auth/login", requestUrl.origin).toString();
  if (value.startsWith("/")) return new URL(value, requestUrl.origin).toString();

  try {
    const parsed = new URL(value);
    if (parsed.origin === requestUrl.origin) {
      return parsed.toString();
    }
  } catch {
    return new URL("/auth/login", requestUrl.origin).toString();
  }

  return new URL("/auth/login", requestUrl.origin).toString();
};

function createTrampolineHtml(nextTarget: string, fallbackTarget: string) {
  const nextJson = JSON.stringify(nextTarget);
  const fallbackJson = JSON.stringify(fallbackTarget);
  const fallbackDelay = JSON.stringify(FALLBACK_DELAY_MS);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Opening GradientPeak</title>
  </head>
  <body>
    <p style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;">Opening GradientPeak...</p>
    <script>
      const nextTarget = ${nextJson};
      const fallbackTarget = ${fallbackJson};
      const fallbackDelayMs = ${fallbackDelay};
      let didHide = false;
      const fallback = () => {
        if (!didHide) {
          window.location.replace(fallbackTarget);
        }
      };
      const timer = window.setTimeout(fallback, fallbackDelayMs);
      const markHidden = () => {
        didHide = true;
        window.clearTimeout(timer);
      };
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          markHidden();
        }
      });
      window.addEventListener("pagehide", markHidden, { once: true });
      window.location.replace(nextTarget);
    </script>
  </body>
</html>`;
}

export const Route = createFileRoute("/auth/open")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const requestUrl = new URL(request.url);
        const nextTarget = requestUrl.searchParams.get("next") ?? undefined;
        const fallbackTarget = getSafeFallback(
          request,
          requestUrl.searchParams.get("fallback") ?? undefined,
        );

        if (!nextTarget || !isDeepLink(nextTarget)) {
          return Response.redirect(fallbackTarget, 302);
        }

        return new Response(createTrampolineHtml(nextTarget, fallbackTarget), {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
