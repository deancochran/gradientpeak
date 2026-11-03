export function getAppBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function getConfiguredAppBaseUrl() {
  if (typeof process !== "undefined") {
    return process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  }

  return getAppBaseUrl();
}

export function getRequestBaseUrl(request: Request) {
  return new URL(request.url).origin;
}

export function toAbsoluteAppUrl(path: string) {
  return new URL(path, getConfiguredAppBaseUrl()).toString();
}

function hasUnsafeRedirectCharacters(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return character === "\\" || code <= 0x1f || code === 0x7f;
  });
}

export function getSafeAppRedirectTarget(
  redirectTarget: string | null | undefined,
  fallback = "/",
) {
  if (!redirectTarget) {
    return fallback;
  }

  // WHATWG URL strips ASCII controls and treats backslashes as path separators for
  // special schemes. Reject both raw and nested-encoded forms before parsing, then
  // still parse every remaining candidate against the trusted application base.
  let decodedTarget = redirectTarget;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (hasUnsafeRedirectCharacters(decodedTarget)) return fallback;
    try {
      const next = decodeURIComponent(decodedTarget);
      if (next === decodedTarget) break;
      decodedTarget = next;
    } catch {
      return fallback;
    }
  }

  try {
    const baseUrl = typeof window !== "undefined" ? getAppBaseUrl() : getConfiguredAppBaseUrl();
    const parsedBase = new URL(baseUrl);
    const parsedTarget = new URL(redirectTarget, parsedBase);

    if (parsedTarget.origin !== parsedBase.origin) {
      return fallback;
    }

    return `${parsedTarget.pathname}${parsedTarget.search}${parsedTarget.hash}`;
  } catch {
    return fallback;
  }
}
