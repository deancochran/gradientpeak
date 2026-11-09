export const WAHOO_RECONNECT_REQUIRED_MESSAGE =
  "Wahoo reconnect required. Please reconnect your Wahoo account.";

export class WahooReconnectRequiredError extends Error {
  readonly code = "WAHOO_RECONNECT_REQUIRED";
  readonly status = 401;

  constructor() {
    super(WAHOO_RECONNECT_REQUIRED_MESSAGE);
    this.name = "WahooReconnectRequiredError";
  }
}

export const WAHOO_AUTHORIZATION_RESET_REQUIRED_MESSAGE =
  "Wahoo authorization reset required. Revoke GradientPeak in Wahoo, then reconnect.";

export class WahooAuthorizationResetRequiredError extends Error {
  readonly code = "WAHOO_AUTHORIZATION_RESET_REQUIRED";
  readonly status = 400;

  constructor() {
    super(WAHOO_AUTHORIZATION_RESET_REQUIRED_MESSAGE);
    this.name = "WahooAuthorizationResetRequiredError";
  }
}

export class WahooCredentialConflictError extends Error {
  constructor() {
    super("Wahoo credentials changed while refreshing; retry the operation");
    this.name = "WahooCredentialConflictError";
  }
}

type WahooCredentials = {
  accessToken: string;
  credentialGeneration: number;
  expiresAt: string | null;
  id: string;
  integrationGeneration: number;
  reconnectRequiredAt?: string | null;
  refreshToken: string | null;
};

type RefreshedWahooCredentials = Pick<
  WahooCredentials,
  "accessToken" | "expiresAt" | "refreshToken"
>;
const refreshesByIntegrationId = new Map<string, Promise<WahooCredentials>>();

function isDefinitiveCredentialFailure(error: unknown): boolean {
  if (
    error instanceof WahooReconnectRequiredError ||
    error instanceof WahooAuthorizationResetRequiredError
  )
    return true;
  if (!error || typeof error !== "object") return false;

  const status = "status" in error ? error.status : undefined;
  const code = "code" in error ? error.code : undefined;
  return status === 401 || (typeof code === "string" && code.toLowerCase() === "invalid_grant");
}

function normalizeDefinitiveCredentialFailure(error: unknown): Error {
  return error instanceof WahooAuthorizationResetRequiredError
    ? error
    : new WahooReconnectRequiredError();
}

export async function resolveWahooCredentials<T extends WahooCredentials>(input: {
  activateAccessToken(accessToken: string): Promise<void>;
  integration: T;
  now?: number;
  markReconnectRequired?(
    input: Pick<WahooCredentials, "credentialGeneration" | "id" | "integrationGeneration">,
  ): Promise<boolean>;
  persistTokens(tokens: WahooCredentials): Promise<number | null>;
  readCurrentCredentials?(): Promise<T | null>;
  refreshAccessToken(refreshToken: string): Promise<RefreshedWahooCredentials>;
  refreshWindowMs?: number;
  /** One durable CAS loss may refresh the winner; further loss is retryable. */
  casRetries?: number;
}): Promise<T> {
  const expiresAt = input.integration.expiresAt
    ? Date.parse(input.integration.expiresAt)
    : Number.POSITIVE_INFINITY;
  const refreshWindowMs = input.refreshWindowMs ?? 60_000;

  if (input.integration.reconnectRequiredAt) throw new WahooReconnectRequiredError();
  if (expiresAt > (input.now ?? Date.now()) + refreshWindowMs) {
    return input.integration;
  }

  if (!input.integration.refreshToken) {
    if (await input.markReconnectRequired?.(input.integration))
      throw new WahooReconnectRequiredError();
    const current = await input.readCurrentCredentials?.();
    if (!current || current.reconnectRequiredAt) throw new WahooReconnectRequiredError();
    if ((input.casRetries ?? 0) >= 1) throw new WahooCredentialConflictError();
    return resolveWahooCredentials({
      ...input,
      casRetries: (input.casRetries ?? 0) + 1,
      integration: current,
    });
  }
  const refreshToken = input.integration.refreshToken;

  const existingRefresh = refreshesByIntegrationId.get(input.integration.id);
  if (existingRefresh) {
    return { ...input.integration, ...(await existingRefresh) };
  }

  const refresh = (async (): Promise<WahooCredentials> => {
    let refreshed: RefreshedWahooCredentials;
    try {
      refreshed = await input.refreshAccessToken(refreshToken);
    } catch (error) {
      if (isDefinitiveCredentialFailure(error)) {
        const credentialError = normalizeDefinitiveCredentialFailure(error);
        if (await input.markReconnectRequired?.(input.integration)) throw credentialError;
        const current = await input.readCurrentCredentials?.();
        if (!current || current.reconnectRequiredAt) throw credentialError;
        if ((input.casRetries ?? 0) >= 1) throw new WahooCredentialConflictError();
        return resolveWahooCredentials({
          ...input,
          casRetries: (input.casRetries ?? 0) + 1,
          integration: current,
        });
      }
      throw error;
    }

    const credentials: WahooCredentials = {
      accessToken: refreshed.accessToken,
      credentialGeneration: input.integration.credentialGeneration,
      expiresAt: refreshed.expiresAt,
      integrationGeneration: input.integration.integrationGeneration,
      id: input.integration.id,
      reconnectRequiredAt: null,
      refreshToken: refreshed.refreshToken,
    };
    const generation = await input.persistTokens(credentials);
    if (generation !== null) {
      // Persist first so a failed activation retries this token instead of minting another.
      // Wahoo retires the previous token after this authenticated API request succeeds.
      const persistedCredentials = { ...credentials, credentialGeneration: generation };
      try {
        await input.activateAccessToken(credentials.accessToken);
      } catch (error) {
        if (isDefinitiveCredentialFailure(error)) {
          await input.markReconnectRequired?.(persistedCredentials);
          throw normalizeDefinitiveCredentialFailure(error);
        }
        throw error;
      }
      return persistedCredentials;
    }
    const current = await input.readCurrentCredentials?.();
    if (!current || current.reconnectRequiredAt) throw new WahooReconnectRequiredError();
    if ((input.casRetries ?? 0) >= 1) throw new WahooCredentialConflictError();
    return resolveWahooCredentials({
      ...input,
      casRetries: (input.casRetries ?? 0) + 1,
      integration: current,
    });
  })();
  refreshesByIntegrationId.set(input.integration.id, refresh);

  try {
    return { ...input.integration, ...(await refresh) };
  } finally {
    if (refreshesByIntegrationId.get(input.integration.id) === refresh) {
      refreshesByIntegrationId.delete(input.integration.id);
    }
  }
}
