import { z } from "zod";
import { logger } from "../../logger";
import { requireStravaOAuthConfig } from "../oauth-config";
import { getOAuthCallbackUrl } from "../oauth-state-binding";
import { StravaClient } from "./client";

const identifierSchema = z.union([
  z.string().regex(/^\d{1,20}$/),
  z.number().int().safe().nonnegative(),
]);
const tokenBase = {
  token_type: z.literal("Bearer"),
  access_token: z.string().trim().min(1).max(8_192),
  refresh_token: z.string().trim().min(1).max(8_192),
  expires_at: z.number().int().positive(),
  expires_in: z.number().int().positive().max(86_400),
};
const stravaOAuthTokenResponseSchema = z
  .object({
    ...tokenBase,
    athlete: z.object({ id: identifierSchema }).passthrough().optional(),
    scope: z.string().max(1_024).optional(),
  })
  .passthrough();
const stravaRefreshTokenResponseSchema = z.object(tokenBase).passthrough();
const MAX_OAUTH_RESPONSE_BYTES = 64 * 1_024;

export type StravaOAuthTokenResponse = z.infer<typeof stravaOAuthTokenResponseSchema>;
export type StravaRefreshTokenResponse = z.infer<typeof stravaRefreshTokenResponseSchema>;

export class StravaOAuthError extends Error {
  constructor(public readonly reason: string) {
    super("Strava OAuth request failed");
    this.name = StravaOAuthError.name;
  }
}

export class StravaOAuthIdentityError extends Error {
  constructor() {
    super("Provider account identity could not be verified");
    this.name = StravaOAuthIdentityError.name;
  }
}

async function readBoundedOAuthJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_OAUTH_RESPONSE_BYTES) {
    throw new StravaOAuthError("invalid_token_response");
  }
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > MAX_OAUTH_RESPONSE_BYTES) {
      await reader.cancel();
      throw new StravaOAuthError("invalid_token_response");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new StravaOAuthError("invalid_token_response");
  }
}

async function postToken<T>(input: {
  body: URLSearchParams;
  fetchImpl?: typeof fetch;
  schema: z.ZodType<T>;
  timeoutMs?: number;
}): Promise<T> {
  const config = requireStravaOAuthConfig();
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.timeoutMs ?? 10_000);
  try {
    const response = await (input.fetchImpl ?? fetch)(config.tokenUrl, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: input.body.toString(),
      signal: controller.signal,
    });
    if (!response.ok) {
      let reason = response.status === 429 ? "rate_limited" : `http_${response.status}`;
      if (response.status === 400) {
        try {
          const rejection = z
            .object({ error: z.string().max(96).optional() })
            .passthrough()
            .safeParse(await readBoundedOAuthJson(response));
          if (rejection.success && rejection.data.error === "invalid_grant") {
            reason = "invalid_grant";
          }
        } catch {
          // The bounded status-derived reason is sufficient for malformed rejection bodies.
        }
      }
      logger.warn("Strava OAuth token request failed", {
        provider: "strava",
        operation: "oauth_token",
        outcome: reason,
        status: response.status,
      });
      throw new StravaOAuthError(reason);
    }
    const parsed = input.schema.safeParse(await readBoundedOAuthJson(response));
    if (!parsed.success) throw new StravaOAuthError("invalid_token_response");
    return parsed.data;
  } catch (error) {
    if (error instanceof StravaOAuthError) throw error;
    throw new StravaOAuthError(timedOut ? "request_timeout" : "network_unavailable");
  } finally {
    clearTimeout(timer);
  }
}

export async function exchangeStravaOAuthCode(
  code: string,
  fetchImpl?: typeof fetch,
): Promise<StravaOAuthTokenResponse> {
  const config = requireStravaOAuthConfig();
  return postToken({
    fetchImpl,
    schema: stravaOAuthTokenResponseSchema,
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: getOAuthCallbackUrl("strava"),
    }),
  });
}

export async function refreshStravaAccessToken(
  refreshToken: string,
  fetchImpl?: typeof fetch,
): Promise<StravaRefreshTokenResponse> {
  const config = requireStravaOAuthConfig();
  return postToken({
    fetchImpl,
    schema: stravaRefreshTokenResponseSchema,
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
}

export async function resolveStravaOAuthIdentity(
  tokens: StravaOAuthTokenResponse,
  createClient: (accessToken: string) => Pick<StravaClient, "getAuthenticatedAthlete"> = (
    accessToken,
  ) => new StravaClient({ accessToken }),
): Promise<{ externalId: string; requiresActivation: false }> {
  if (tokens.athlete?.id !== undefined) {
    return { externalId: String(tokens.athlete.id), requiresActivation: false };
  }
  try {
    const athlete = await createClient(tokens.access_token).getAuthenticatedAthlete();
    return { externalId: String(athlete.data.id), requiresActivation: false };
  } catch {
    throw new StravaOAuthIdentityError();
  }
}

export async function deauthorizeStravaAccessToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl("https://www.strava.com/oauth/deauthorize", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ access_token: token }).toString(),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new StravaOAuthError(`deauthorize_http_${response.status}`);
}

export function classifyStravaOAuthFailure(error: unknown) {
  if (error instanceof StravaOAuthIdentityError) {
    return {
      kind: "identity" as const,
      code: "provider_identity_failed",
      message: "Provider account identity could not be verified",
    };
  }
  return {
    kind: "exchange" as const,
    code: "token_exchange_failed",
    message: "Integration connection failed",
    ...(error instanceof StravaOAuthError ? { reason: error.reason } : {}),
  };
}
