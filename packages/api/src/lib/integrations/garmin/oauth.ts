import { z } from "zod";
import { logger } from "../../logger";
import { requireGarminTokenConfig, requireProviderOAuthConfig } from "../oauth-config";
import { deriveOAuthCodeVerifier } from "../oauth-pkce";
import { getOAuthCallbackUrl } from "../oauth-state-binding";

const MAX_RESPONSE_BYTES = 64 * 1_024;
const tokenSchema = z
  .object({
    access_token: z.string().trim().min(1).max(8_192),
    expires_in: z.number().int().positive().max(31_536_000),
    refresh_token: z.string().trim().min(1).max(8_192),
    refresh_token_expires_in: z.number().int().positive().max(31_536_000),
    token_type: z.string().trim().toLowerCase().pipe(z.literal("bearer")),
  })
  .passthrough();
const userIdSchema = z.object({ userId: z.string().trim().min(1).max(512) }).strict();
const permissionsSchema = z.union([
  z.array(z.string().trim().min(1).max(128)).max(64),
  z.object({ permissions: z.array(z.string().trim().min(1).max(128)).max(64) }).strict(),
]);

export type GarminOAuthTokenResponse = z.infer<typeof tokenSchema>;

export class GarminOAuthError extends Error {
  constructor(public readonly reason: string) {
    super("Garmin OAuth request failed");
    this.name = "GarminOAuthError";
  }
}

export class GarminOAuthIdentityError extends Error {
  constructor() {
    super("Garmin account identity or permissions could not be verified");
    this.name = "GarminOAuthIdentityError";
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new GarminOAuthError("invalid_response");
  }
  if (!response.body) throw new GarminOAuthError("invalid_response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new GarminOAuthError("invalid_response");
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
    throw new GarminOAuthError("invalid_response");
  }
}

async function request<T>(input: {
  body?: URLSearchParams;
  fetchImpl?: typeof fetch;
  method: "DELETE" | "GET" | "POST";
  schema?: z.ZodType<T>;
  token?: string;
  url: string;
}): Promise<T | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await (input.fetchImpl ?? fetch)(input.url, {
      method: input.method,
      headers: {
        Accept: "application/json",
        ...(input.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}),
      },
      ...(input.body ? { body: input.body.toString() } : {}),
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      let reason = `http_${response.status}`;
      if (response.status === 400) {
        try {
          const rejection = z
            .object({ error: z.string().max(96).optional() })
            .passthrough()
            .safeParse(await readBoundedJson(response));
          if (
            rejection.success &&
            rejection.data.error &&
            ["invalid_grant", "invalid_client", "invalid_request"].includes(rejection.data.error)
          )
            reason = rejection.data.error;
        } catch {
          // A malformed rejection remains a bounded, status-derived failure.
        }
      }
      throw new GarminOAuthError(reason);
    }
    if (!input.schema) return undefined;
    const parsed = input.schema.safeParse(await readBoundedJson(response));
    if (!parsed.success) throw new GarminOAuthError("invalid_response");
    return parsed.data;
  } catch (error) {
    if (error instanceof GarminOAuthError) throw error;
    throw new GarminOAuthError(
      controller.signal.aborted ? "request_timeout" : "network_unavailable",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function exchangeGarminOAuthCode(
  code: string,
  state: string,
  fetchImpl?: typeof fetch,
): Promise<GarminOAuthTokenResponse> {
  const config = requireProviderOAuthConfig("garmin");
  const response = await request({
    ...(fetchImpl ? { fetchImpl } : {}),
    method: "POST",
    schema: tokenSchema,
    url: config.tokenUrl,
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      code_verifier: deriveOAuthCodeVerifier({
        clientSecret: config.clientSecret,
        provider: "garmin",
        state,
      }),
      grant_type: "authorization_code",
      redirect_uri: getOAuthCallbackUrl("garmin"),
    }),
  });
  if (!response) throw new GarminOAuthError("invalid_response");
  return response;
}

export async function refreshGarminAccessToken(
  refreshToken: string,
  fetchImpl?: typeof fetch,
): Promise<GarminOAuthTokenResponse> {
  let config: ReturnType<typeof requireGarminTokenConfig>;
  try {
    config = requireGarminTokenConfig();
  } catch {
    throw new GarminOAuthError("configuration_unavailable");
  }
  const response = await request({
    ...(fetchImpl ? { fetchImpl } : {}),
    method: "POST",
    schema: tokenSchema,
    url: config.tokenUrl,
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!response) throw new GarminOAuthError("invalid_response");
  return response;
}

export async function resolveGarminOAuthIdentity(input: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<{ externalId: string; permissions: string[]; requiresActivation: false }> {
  try {
    const [id, rawPermissions] = await Promise.all([
      request({
        ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
        method: "GET",
        schema: userIdSchema,
        token: input.accessToken,
        url: "https://apis.garmin.com/partner-gateway/rest/user/id",
      }),
      request({
        ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
        method: "GET",
        schema: permissionsSchema,
        token: input.accessToken,
        url: "https://apis.garmin.com/partner-gateway/rest/user/permissions",
      }),
    ]);
    if (!id || !rawPermissions) throw new GarminOAuthError("invalid_response");
    const permissions = Array.isArray(rawPermissions) ? rawPermissions : rawPermissions.permissions;
    return {
      externalId: id.userId,
      permissions: [...new Set(permissions)].sort(),
      requiresActivation: false,
    };
  } catch (error) {
    logger.warn("Garmin OAuth identity or permission request failed", {
      provider: "garmin",
      outcome: error instanceof GarminOAuthError ? error.reason : "unknown",
    });
    throw new GarminOAuthIdentityError();
  }
}

/** Garmin documents remote registration deletion for every user-visible disconnect. */
export async function deregisterGarminUser(
  accessToken: string,
  fetchImpl?: typeof fetch,
): Promise<void> {
  await request({
    ...(fetchImpl ? { fetchImpl } : {}),
    method: "DELETE",
    token: accessToken,
    url: "https://apis.garmin.com/partner-gateway/rest/user/registration",
  });
}

export function classifyGarminOAuthFailure(error: unknown) {
  if (error instanceof GarminOAuthIdentityError) {
    return { kind: "identity" as const, code: "provider_identity_failed", message: error.message };
  }
  return {
    kind: "exchange" as const,
    code: "token_exchange_failed",
    message: "Integration connection failed",
    ...(error instanceof GarminOAuthError ? { reason: error.reason } : {}),
  };
}
