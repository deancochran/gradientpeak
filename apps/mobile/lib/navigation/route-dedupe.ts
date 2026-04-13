type RouteParams = Record<string, unknown>;

function normalizeScalar(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeScalar(entry) ?? "").join(",");
  }

  return String(value);
}

function resolveDynamicPath(pathname: string, params: RouteParams) {
  const consumedKeys = new Set<string>();

  const resolvedPathname = pathname.replace(/\[(\.\.\.)?([^\]]+)\]/g, (match, spread, key) => {
    consumedKeys.add(key);
    const value = params[key];
    if (value === undefined || value === null) {
      return match;
    }

    if (spread) {
      return Array.isArray(value) ? value.map((entry) => String(entry)).join("/") : String(value);
    }

    return String(value);
  });

  return { consumedKeys, resolvedPathname };
}

function appendNormalizedParams(searchParams: URLSearchParams, params: RouteParams, consumedKeys: Set<string>) {
  const entries = Object.entries(params)
    .filter(([key, value]) => !consumedKeys.has(key) && value !== undefined && value !== null)
    .sort(([left], [right]) => left.localeCompare(right));

  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      const normalizedValues = value
        .map((entry) => normalizeScalar(entry))
        .filter((entry): entry is string => entry !== null)
        .sort();

      for (const entry of normalizedValues) {
        searchParams.append(key, entry);
      }
      continue;
    }

    const normalizedValue = normalizeScalar(value);
    if (normalizedValue !== null) {
      searchParams.append(key, normalizedValue);
    }
  }
}

function buildSearchString(searchParams: URLSearchParams) {
  const entries = Array.from(searchParams.entries()).sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    const keyComparison = leftKey.localeCompare(rightKey);
    return keyComparison !== 0 ? keyComparison : leftValue.localeCompare(rightValue);
  });

  if (entries.length === 0) {
    return "";
  }

  const normalizedSearch = new URLSearchParams();
  for (const [key, value] of entries) {
    normalizedSearch.append(key, value);
  }

  return `?${normalizedSearch.toString()}`;
}

export function buildHrefKey(href: string | { pathname: string; params?: RouteParams }) {
  if (typeof href === "string") {
    const url = new URL(href, "https://gradientpeak.local");
    return `${url.pathname}${buildSearchString(url.searchParams)}`;
  }

  const params = href.params ?? {};
  const { consumedKeys, resolvedPathname } = resolveDynamicPath(href.pathname, params);
  const searchParams = new URLSearchParams();
  appendNormalizedParams(searchParams, params, consumedKeys);

  return `${resolvedPathname}${buildSearchString(searchParams)}`;
}

export function buildCurrentRouteKey(pathname: string, params: RouteParams) {
  const pathSegments = new Set(pathname.split("/").filter(Boolean));
  const filteredParams = Object.fromEntries(
    Object.entries(params).filter(([_key, value]) => {
      if (Array.isArray(value)) {
        return !value.every((entry) => pathSegments.has(String(entry)));
      }

      return value !== undefined && value !== null && !pathSegments.has(String(value));
    }),
  );

  const searchParams = new URLSearchParams();
  appendNormalizedParams(searchParams, filteredParams, new Set());

  return `${pathname}${buildSearchString(searchParams)}`;
}
