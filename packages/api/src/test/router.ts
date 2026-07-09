type TestRouter = {
  createCaller: (...args: any[]) => any;
};

type TestSession = {
  user: {
    id: string;
  };
};

export type TestRouterCallerContext = {
  db?: unknown;
  session: TestSession | null;
  headers: Headers;
  clientType: string;
  trpcSource: string;
} & Record<string, unknown>;

export type CreateRouterCallerOptions = {
  db?: unknown;
  userId?: string;
  session?: TestSession | null;
  headers?: Headers;
  clientType?: string;
  trpcSource?: string;
  context?: Record<string, unknown>;
};

export function createRouterCallerContext({
  db,
  userId = "profile-123",
  session,
  headers = new Headers(),
  clientType = "test",
  trpcSource = "vitest",
  context,
}: CreateRouterCallerOptions = {}): TestRouterCallerContext {
  return {
    db,
    session: session === undefined ? { user: { id: userId } } : session,
    headers,
    clientType,
    trpcSource,
    ...context,
  };
}

export function createRouterCaller<TRouter extends TestRouter>(
  router: TRouter,
  options: CreateRouterCallerOptions = {},
) {
  return router.createCaller(createRouterCallerContext(options)) as ReturnType<
    TRouter["createCaller"]
  >;
}
