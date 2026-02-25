import { createServerCaller } from "@/lib/trpc/server";
import { type NextRequest, NextResponse } from "next/server";

const DEFAULT_MOBILE_DEEP_LINK = "gradientpeak://sign-in";

const getPublicWebAppUrl = (request: NextRequest) => {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    new URL(request.url).origin
  );
};

const extractSchemePrefix = (uri: string) => {
  const match = uri.match(/^([a-z][a-z0-9+.-]*:\/\/)/i);
  return match?.[1]?.toLowerCase() ?? null;
};

const getAllowedDeepLinkPrefixes = () => {
  const configuredPrefixes = process.env.AUTH_ALLOWED_DEEP_LINK_PREFIXES?.split(
    ",",
  )
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (configuredPrefixes && configuredPrefixes.length > 0) {
    return configuredPrefixes;
  }

  const envPrefixes = [
    process.env.NEXT_PUBLIC_MOBILE_AUTH_REDIRECT_URI,
    process.env.NEXT_PUBLIC_MOBILE_AUTH_REDIRECT_FALLBACK,
    process.env.NEXT_PUBLIC_MOBILE_REDIRECT_URI,
    process.env.NEXT_PUBLIC_MOBILE_REDIRECT_FALLBACK,
    process.env.EXPO_PUBLIC_REDIRECT_URL,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => extractSchemePrefix(value))
    .filter((value): value is string => Boolean(value));

  return [
    ...new Set([
      "gradientpeak://",
      "gradientpeak-dev://",
      "gradientpeak-prev://",
      ...envPrefixes,
    ]),
  ];
};

const getDefaultDeepLinkTarget = () =>
  process.env.NEXT_PUBLIC_MOBILE_AUTH_REDIRECT_URI ?? DEFAULT_MOBILE_DEEP_LINK;

const getDefaultWebFallback = (request: NextRequest) =>
  new URL("/auth/login", getPublicWebAppUrl(request)).toString();

const getSafeRedirectTarget = (nextParam: string | null) => {
  if (!nextParam) return getDefaultDeepLinkTarget();

  const normalizedValue = nextParam.toLowerCase();
  const allowedPrefixes = getAllowedDeepLinkPrefixes();

  if (allowedPrefixes.some((prefix) => normalizedValue.startsWith(prefix))) {
    return nextParam;
  }

  return getDefaultDeepLinkTarget();
};

const getSafeFallbackTarget = (
  request: NextRequest,
  fallbackParam: string | null,
) => {
  const defaultFallback = getDefaultWebFallback(request);

  if (!fallbackParam) return defaultFallback;

  if (fallbackParam.startsWith("/")) {
    return new URL(fallbackParam, getPublicWebAppUrl(request)).toString();
  }

  try {
    const parsed = new URL(fallbackParam);
    const requestOrigin = new URL(getPublicWebAppUrl(request)).origin;
    if (parsed.origin === requestOrigin) {
      return parsed.toString();
    }
  } catch {
    return defaultFallback;
  }

  return defaultFallback;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = getSafeRedirectTarget(searchParams.get("next"));
  const fallback = getSafeFallbackTarget(request, searchParams.get("fallback"));

  if (token_hash && type) {
    try {
      const trpc = await createServerCaller();
      await trpc.auth.verifyOtp({
        type,
        token_hash,
      });
    } catch (error: unknown) {
      // redirect the user to an error page with some instructions
      const message =
        error instanceof Error ? error.message : "Verification failed";
      const errorUrl = new URL("/auth/error", getPublicWebAppUrl(request));
      errorUrl.searchParams.set("error", message);
      return NextResponse.redirect(errorUrl);
    }

    const openUrl = new URL("/auth/open", getPublicWebAppUrl(request));
    openUrl.searchParams.set("next", next);
    openUrl.searchParams.set("fallback", fallback);
    return NextResponse.redirect(openUrl);
  }

  // redirect the user to an error page with some instructions
  const errorUrl = new URL("/auth/error", getPublicWebAppUrl(request));
  errorUrl.searchParams.set("error", "No token hash or type");
  return NextResponse.redirect(errorUrl);
}
