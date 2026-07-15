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

type WahooCredentials = {
  accessToken: string;
  expiresAt: string | null;
  id: string;
  refreshToken: string | null;
};

type RefreshedWahooCredentials = Omit<WahooCredentials, "id">;
const refreshesByIntegrationId = new Map<string, Promise<WahooCredentials>>();

function isDefinitiveCredentialFailure(error: unknown): boolean {
  if (error instanceof WahooReconnectRequiredError) return true;
  if (!error || typeof error !== "object") return false;

  const status = "status" in error ? error.status : undefined;
  const code = "code" in error ? error.code : undefined;
  return status === 401 || (typeof code === "string" && code.toLowerCase() === "invalid_grant");
}

export async function resolveWahooCredentials<T extends WahooCredentials>(input: {
  integration: T;
  now?: number;
  persistTokens(tokens: WahooCredentials): Promise<void>;
  refreshAccessToken(refreshToken: string): Promise<RefreshedWahooCredentials>;
  refreshWindowMs?: number;
}): Promise<T> {
  const expiresAt = input.integration.expiresAt
    ? Date.parse(input.integration.expiresAt)
    : Number.POSITIVE_INFINITY;
  const refreshWindowMs = input.refreshWindowMs ?? 60_000;

  if (expiresAt > (input.now ?? Date.now()) + refreshWindowMs) {
    return input.integration;
  }

  if (!input.integration.refreshToken) {
    throw new WahooReconnectRequiredError();
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
        throw new WahooReconnectRequiredError();
      }
      throw error;
    }

    const credentials = {
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
      id: input.integration.id,
      refreshToken: refreshed.refreshToken,
    };
    await input.persistTokens(credentials);
    return credentials;
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
