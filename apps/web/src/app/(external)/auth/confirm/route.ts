import { buildMobileCallbackUrl } from "@repo/auth/callbacks";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const DEFAULT_MOBILE_DEEP_LINK = "gradientpeak://sign-in";

const getPublicWebAppUrl = (request: NextRequest) => {
  return process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? new URL(request.url).origin;
};

const extractSchemePrefix = (uri: string) => {
  const match = uri.match(/^([a-z][a-z0-9+.-]*:\/\/)/i);
  return match?.[1]?.toLowerCase() ?? null;
};

const getAllowedDeepLinkPrefixes = () => {
  const configuredPrefixes = process.env.AUTH_ALLOWED_DEEP_LINK_PREFIXES?.split(",")
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
    ...new Set(["gradientpeak://", "gradientpeak-dev://", "gradientpeak-prev://", ...envPrefixes]),
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

const getSafeFallbackTarget = (request: NextRequest, fallbackParam: string | null) => {
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
  const error = searchParams.get("error");
  const intent = searchParams.get("intent");
  const target = searchParams.get("target");
  const token = searchParams.get("token") ?? undefined;
  const code = searchParams.get("code") ?? undefined;
  const next = getSafeRedirectTarget(searchParams.get("next"));
  const fallback = getSafeFallbackTarget(request, searchParams.get("fallback"));

  if (error) {
    const errorUrl = new URL("/auth/error", getPublicWebAppUrl(request));
    errorUrl.searchParams.set("error", error);
    return NextResponse.redirect(errorUrl);
  }

  if (target === "mobile" && intent) {
    const openUrl = new URL("/auth/open", getPublicWebAppUrl(request));
    openUrl.searchParams.set(
      "next",
      buildMobileCallbackUrl(
        {
          intent: intent as "email-verification" | "password-reset" | "post-sign-in",
          ...(token ? { token } : {}),
          ...(code ? { code } : {}),
          ...(error ? { error } : {}),
        },
        {
          mobileScheme:
            process.env.EXPO_PUBLIC_APP_SCHEME ?? process.env.APP_SCHEME ?? "gradientpeak",
          mobileCallbackPath: "callback",
        },
      ),
    );
    openUrl.searchParams.set("fallback", fallback);
    return NextResponse.redirect(openUrl);
  }

  if (target === "web") {
    return NextResponse.redirect(
      getSafeFallbackTarget(request, searchParams.get("next") ?? searchParams.get("fallback")),
    );
  }

  if (searchParams.get("token") || searchParams.get("intent")) {
    const openUrl = new URL("/auth/open", getPublicWebAppUrl(request));
    openUrl.searchParams.set("next", next);
    openUrl.searchParams.set("fallback", fallback);
    return NextResponse.redirect(openUrl);
  }

  const hasLegacySupabaseOtpParams =
    Boolean(searchParams.get("token_hash")) || Boolean(searchParams.get("type"));

  if (hasLegacySupabaseOtpParams) {
    const errorUrl = new URL("/auth/error", getPublicWebAppUrl(request));
    errorUrl.searchParams.set(
      "error",
      "This verification link uses the retired Supabase OTP flow. Request a new email and try again.",
    );
    return NextResponse.redirect(errorUrl);
  }

  // redirect the user to an error page with some instructions
  const errorUrl = new URL("/auth/error", getPublicWebAppUrl(request));
  errorUrl.searchParams.set("error", "Missing auth callback parameters");
  return NextResponse.redirect(errorUrl);
}
