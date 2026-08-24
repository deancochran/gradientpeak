import type { Page, Route } from "@playwright/test";

export type TrpcInterception = {
  calls: () => number;
};

type TrpcRouteOptions = {
  times?: number;
};

type TrpcFailureOptions = TrpcRouteOptions & {
  errorCode?: Parameters<Route["abort"]>[0];
  afterRequest?: boolean;
};

function trpcProcedures(url: URL) {
  const marker = "/api/trpc/";
  const markerIndex = url.pathname.indexOf(marker);
  if (markerIndex === -1) return [];
  return decodeURIComponent(url.pathname.slice(markerIndex + marker.length)).split(",");
}

export function isTrpcProcedure(url: URL, procedure: string) {
  return trpcProcedures(url).includes(procedure);
}

async function withTrpcHandler<T>(
  page: Page,
  procedure: string,
  handler: (route: Route) => Promise<void>,
  run: (interception: TrpcInterception) => Promise<T>,
  options: TrpcRouteOptions = {},
) {
  const matcher = (url: URL) => isTrpcProcedure(url, procedure);
  let calls = 0;
  const countedHandler = async (route: Route) => {
    calls += 1;
    await handler(route);
  };
  await page.route(matcher, countedHandler, options.times ? { times: options.times } : undefined);
  try {
    return await run({ calls: () => calls });
  } finally {
    await page.unroute(matcher, countedHandler);
  }
}

export async function withTrpcFailure<T>(
  page: Page,
  procedure: string,
  run: (interception: TrpcInterception) => Promise<T>,
  options: TrpcFailureOptions = {},
) {
  return withTrpcHandler(
    page,
    procedure,
    async (route) => {
      if (options.afterRequest) await route.fetch();
      await route.abort(options.errorCode ?? "failed");
    },
    run,
    options,
  );
}

export async function withTrpcResponse<T>(
  page: Page,
  procedure: string,
  response: { body: unknown; status?: number },
  run: (interception: TrpcInterception) => Promise<T>,
  options: TrpcRouteOptions = {},
) {
  return withTrpcHandler(
    page,
    procedure,
    (route) =>
      route.fulfill({
        body: JSON.stringify(response.body),
        contentType: "application/json",
        status: response.status ?? 200,
      }),
    run,
    options,
  );
}
