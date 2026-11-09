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

export function getSafeAppRedirectTarget(
  redirectTarget: string | null | undefined,
  fallback = "/",
) {
  if (!redirectTarget) {
    return fallback;
  }

  // WHATWG URL treats backslashes as path separators for special schemes. Do not
  // accept them in an internal path, including when a caller supplies one encoded.
  // A bounded decode also catches nested query-string encoding without changing the
  // path we return to callers.
  let decodedTarget = redirectTarget;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (decodedTarget.includes("\\")) return fallback;
    try {
      const next = decodeURIComponent(decodedTarget);
      if (next === decodedTarget) break;
      decodedTarget = next;
    } catch {
      break;
    }
  }

  if (redirectTarget.startsWith("/") && !redirectTarget.startsWith("//")) {
    return redirectTarget;
  }

  try {
    const baseUrl = typeof window !== "undefined" ? getAppBaseUrl() : getConfiguredAppBaseUrl();
    const parsedTarget = new URL(redirectTarget);
    const parsedBase = new URL(baseUrl);

    if (parsedTarget.origin !== parsedBase.origin) {
      return fallback;
    }

    return `${parsedTarget.pathname}${parsedTarget.search}${parsedTarget.hash}`;
  } catch {
    return fallback;
  }
}
