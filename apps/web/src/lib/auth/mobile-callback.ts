function extractSchemePrefix(uri: string) {
  const match = uri.match(/^([a-z][a-z0-9+.-]*:\/\/)/i);
  return normalizeSchemePrefix(match?.[1]);
}

const FORBIDDEN_SCHEMES = new Set([
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
]);

function normalizeSchemePrefix(value: string | undefined) {
  const match = value
    ?.trim()
    .toLowerCase()
    .match(/^([a-z][a-z0-9+.-]*):\/\/$/);
  if (!match?.[1] || FORBIDDEN_SCHEMES.has(match[1])) return null;
  return `${match[1]}://`;
}

const FALLBACK_DELAY_MS = 1500;

export function getAllowedMobileAuthSchemePrefixes(
  env: Record<string, string | undefined> = process.env,
) {
  const explicit = env.AUTH_ALLOWED_DEEP_LINK_PREFIXES?.split(",")
    .map(normalizeSchemePrefix)
    .filter((value): value is string => value !== null);
  if (explicit?.length) return [...new Set(explicit)];

  const configuredUris = [
    env.NEXT_PUBLIC_MOBILE_AUTH_REDIRECT_URI,
    env.NEXT_PUBLIC_MOBILE_AUTH_REDIRECT_FALLBACK,
    env.NEXT_PUBLIC_MOBILE_REDIRECT_URI,
    env.NEXT_PUBLIC_MOBILE_REDIRECT_FALLBACK,
    env.EXPO_PUBLIC_REDIRECT_URL,
  ];
  const configuredSchemes = [env.EXPO_PUBLIC_APP_SCHEME, env.APP_SCHEME]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizeSchemePrefix(`${value}://`))
    .filter((value): value is string => value !== null);
  const redirectSchemes = configuredUris
    .filter((value): value is string => Boolean(value))
    .map(extractSchemePrefix)
    .filter((value): value is string => Boolean(value));

  const configured = [...new Set([...configuredSchemes, ...redirectSchemes])];
  if (configured.length > 0) return configured;

  return env.NODE_ENV === "production"
    ? ["gradientpeak://"]
    : ["gradientpeak://", "gradientpeak-dev://", "gradientpeak-prev://"];
}

export function createMobileCallbackTrampolineResponse(nextTarget: string, fallbackTarget: string) {
  const nextJson = serializeForInlineScript(nextTarget);
  const fallbackJson = serializeForInlineScript(fallbackTarget);
  const fallbackDelay = JSON.stringify(FALLBACK_DELAY_MS);
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Opening GradientPeak</title>
  </head>
  <body>
    <p>Opening GradientPeak...</p>
    <script>
      const nextTarget = ${nextJson};
      const fallbackTarget = ${fallbackJson};
      const fallbackDelayMs = ${fallbackDelay};
      let didHide = false;
      const fallback = () => {
        if (!didHide) window.location.replace(fallbackTarget);
      };
      const timer = window.setTimeout(fallback, fallbackDelayMs);
      const markHidden = () => {
        didHide = true;
        window.clearTimeout(timer);
      };
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") markHidden();
      });
      window.addEventListener("pagehide", markHidden, { once: true });
      window.location.replace(nextTarget);
    </script>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

function serializeForInlineScript(value: string) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}
