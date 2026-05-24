export function getAppBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function getConfiguredAppBaseUrl() {
  if (typeof process !== "undefined") {
    return (
      process.env.APP_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      `http://localhost:${process.env.PORT ?? 3000}`
    );
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

  if (redirectTarget.startsWith("/")) {
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
