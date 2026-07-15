type ServerLogLevel = "info" | "warn" | "error";

type ServerLogDetails = Record<string, unknown>;

const REDACTED = "[REDACTED]";
const SENSITIVE_QUERY_PARAMETER_PATTERN =
  /(^|[_-])(access|auth|authorization|code|credential|key|nonce|otp|password|refresh|secret|session|state|ticket|token)([_-]|$)/i;

function redactUrlValue(value: string, depth = 0): string {
  if (depth > 2) {
    return REDACTED;
  }

  const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
  const isRelative = value.startsWith("/");

  if (!isAbsolute && !isRelative) {
    return value;
  }

  try {
    const url = new URL(value, "https://log-redaction.invalid");

    for (const [key, parameterValue] of url.searchParams) {
      url.searchParams.set(
        key,
        SENSITIVE_QUERY_PARAMETER_PATTERN.test(key)
          ? REDACTED
          : redactUrlValue(parameterValue, depth + 1),
      );
    }

    if (url.hash) {
      url.hash = REDACTED;
    }

    return isAbsolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
}

function getRedactedSearch(url: URL): string | undefined {
  for (const [key, value] of url.searchParams) {
    url.searchParams.set(
      key,
      SENSITIVE_QUERY_PARAMETER_PATTERN.test(key) ? REDACTED : redactUrlValue(value),
    );
  }

  return url.search || undefined;
}

function getRequestContext(request?: Request) {
  if (!request) {
    return {};
  }

  const url = new URL(request.url);
  const referer = request.headers.get("referer");

  return {
    method: request.method,
    path: url.pathname,
    search: getRedactedSearch(url),
    userAgent: request.headers.get("user-agent") ?? undefined,
    referer: referer ? redactUrlValue(referer) : undefined,
    forwardedFor: request.headers.get("x-forwarded-for") ?? undefined,
  };
}

export function logServerEvent(
  event: string,
  details: ServerLogDetails = {},
  options: {
    level?: ServerLogLevel;
    request?: Request;
  } = {},
) {
  const level = options.level ?? "info";
  const record = {
    ts: new Date().toISOString(),
    source: "web",
    event,
    ...getRequestContext(options.request),
    details,
  };

  const line = `[web-log] ${JSON.stringify(record)}`;

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.info(line);
}
