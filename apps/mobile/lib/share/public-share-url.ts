const DEFAULT_PUBLIC_WEB_URL = "https://gradientpeak.app";

function getPublicWebUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_WEB_URL?.trim();
  if (!configuredUrl) return DEFAULT_PUBLIC_WEB_URL;

  try {
    const parsed = new URL(configuredUrl);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.origin
      : DEFAULT_PUBLIC_WEB_URL;
  } catch {
    return DEFAULT_PUBLIC_WEB_URL;
  }
}

export function getPublicShareUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, getPublicWebUrl()).toString();
}
