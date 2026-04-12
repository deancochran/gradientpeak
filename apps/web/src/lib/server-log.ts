type ServerLogLevel = "info" | "warn" | "error";

type ServerLogDetails = Record<string, unknown>;

function getRequestContext(request?: Request) {
  if (!request) {
    return {};
  }

  const url = new URL(request.url);

  return {
    method: request.method,
    path: url.pathname,
    search: url.search || undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
    referer: request.headers.get("referer") ?? undefined,
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
