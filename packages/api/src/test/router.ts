type TestRouter = {
  createCaller: (...args: any[]) => any;
};

type CreateRouterCallerOptions = {
  db: unknown;
  userId?: string;
  headers?: Headers;
  clientType?: string;
  trpcSource?: string;
  context?: Record<string, unknown>;
};

export function createRouterCaller<TRouter extends TestRouter>(
  router: TRouter,
  {
    db,
    userId = "profile-123",
    headers = new Headers(),
    clientType = "test",
    trpcSource = "vitest",
    context,
  }: CreateRouterCallerOptions,
) {
  return router.createCaller({
    db,
    session: { user: { id: userId } },
    headers,
    clientType,
    trpcSource,
    ...context,
  }) as ReturnType<TRouter["createCaller"]>;
}
