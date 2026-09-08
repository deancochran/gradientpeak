import { z } from "zod";
import { logger } from "../../logger";
import { getProviderOAuthConfig, requireProviderOAuthConfig } from "../oauth-config";
import { deriveOAuthCodeVerifier, redeemLocalOAuthAuthorizationCode } from "../oauth-pkce";
import { getOAuthCallbackUrl } from "../oauth-state-binding";
import { isWahooTokenLimitRejection } from "./oauth-errors";

const providerIdentifierSchema = z
  .union([z.string().trim().min(1), z.number().finite().int()])
  .nullable()
  .optional();

const oauthTokenResponseSchema = z
  .object({
    access_token: z.string().trim().min(1),
    refresh_token: z.string().trim().min(1).nullable().optional(),
    expires_in: z
      .union([z.number(), z.string().trim().min(1)])
      .pipe(z.coerce.number<string | number>().finite().positive())
      .optional(),
    scope: z.string().nullable().optional(),
    athlete: z.object({ id: providerIdentifierSchema }).passthrough().nullable().optional(),
    user: z.object({ id: providerIdentifierSchema }).passthrough().nullable().optional(),
    userId: providerIdentifierSchema,
    id: providerIdentifierSchema,
  })
  .passthrough();

export type WahooOAuthTokenResponse = z.infer<typeof oauthTokenResponseSchema>;

const oauthRejectionSchema = z
  .object({
    error: z.string().trim().min(1).max(96).optional(),
    error_description: z.string().trim().min(1).max(512).optional(),
  })
  .passthrough();

export class WahooOAuthTokenExchangeError extends Error {
  constructor(
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = WahooOAuthTokenExchangeError.name;
  }
}

export class WahooOAuthIdentityError extends Error {
  constructor() {
    super("Provider account identity could not be verified");
    this.name = WahooOAuthIdentityError.name;
  }
}

async function classifyOAuthRejection(response: Response): Promise<string> {
  const fallback = `http_${response.status}`;
  try {
    const rawBody = (await response.text()).slice(0, 2048);
    if (!rawBody) return fallback;

    let value: unknown;
    try {
      value = JSON.parse(rawBody);
    } catch {
      const form = new URLSearchParams(rawBody);
      value = {
        error: form.get("error") ?? undefined,
        error_description: form.get("error_description") ?? undefined,
      };
    }

    const rejection = oauthRejectionSchema.safeParse(value);
    if (!rejection.success) return fallback;
    if (isWahooTokenLimitRejection(rejection.data.error, rejection.data.error_description)) {
      return "wahoo_token_limit_exceeded";
    }
    const safeCode = rejection.data.error?.toLowerCase();
    return safeCode && /^[a-z0-9_.-]+$/.test(safeCode) ? safeCode : fallback;
  } catch {
    return fallback;
  }
}

function parseOAuthTokenResponse(value: unknown): WahooOAuthTokenResponse {
  const parsed = oauthTokenResponseSchema.safeParse(value);
  if (!parsed.success) {
    const hasMalformedProviderIdentifier = parsed.error.issues.some((issue) =>
      ["athlete", "user", "userId", "id"].includes(String(issue.path[0])),
    );
    if (hasMalformedProviderIdentifier) throw new WahooOAuthIdentityError();
    throw new WahooOAuthTokenExchangeError(
      "OAuth token response was invalid",
      "invalid_token_response",
    );
  }
  return parsed.data;
}

export async function exchangeWahooOAuthCode(
  code: string,
  state: string,
): Promise<WahooOAuthTokenResponse> {
  const config = requireProviderOAuthConfig("wahoo");
  const codeVerifier = deriveOAuthCodeVerifier({
    clientSecret: config.clientSecret,
    provider: "wahoo",
    state,
  });
  if (config.adapter === "local-test") {
    try {
      return parseOAuthTokenResponse(
        redeemLocalOAuthAuthorizationCode({
          code,
          config,
          provider: "wahoo",
          verifier: codeVerifier,
        }),
      );
    } catch {
      throw new WahooOAuthTokenExchangeError("Local token exchange failed", "invalid_grant");
    }
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    code,
    grant_type: "authorization_code",
    redirect_uri: getOAuthCallbackUrl("wahoo"),
  });
  if (config.pkce) body.set("code_verifier", codeVerifier);
  if (config.tokenClientAuthentication === "client_secret_post") {
    body.set("client_secret", config.clientSecret);
  }
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (config.tokenClientAuthentication === "client_secret_basic") {
    headers.Authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });
  if (!response.ok) {
    const reason = await classifyOAuthRejection(response);
    logger.warn("OAuth token exchange failed", {
      operation: `oauth_token_${reason}`,
      provider: "wahoo",
      status: response.status,
    });
    throw new WahooOAuthTokenExchangeError("Token exchange failed", reason);
  }
  return parseOAuthTokenResponse(await response.json());
}

function resolveTokenExternalId(tokens: WahooOAuthTokenResponse): string | null {
  return (
    tokens.athlete?.id?.toString() ||
    tokens.user?.id?.toString() ||
    tokens.userId?.toString() ||
    tokens.id?.toString() ||
    null
  );
}

const wahooUserProfileSchema = z.object({ id: providerIdentifierSchema }).passthrough();

export async function resolveWahooOAuthIdentity(
  tokens: WahooOAuthTokenResponse,
): Promise<{ externalId: string; requiresActivation: boolean }> {
  const tokenExternalId = resolveTokenExternalId(tokens);
  const config = getProviderOAuthConfig("wahoo");
  if (config?.adapter === "local-test") {
    if (tokenExternalId) return { externalId: tokenExternalId, requiresActivation: false };
    throw new WahooOAuthIdentityError();
  }

  // Identity-bearing credentials must be durable before Wahoo's first authenticated profile call.
  if (tokenExternalId) return { externalId: tokenExternalId, requiresActivation: true };

  try {
    const userResponse = await fetch("https://api.wahooligan.com/v1/user", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
    });
    if (!userResponse.ok) throw new WahooOAuthIdentityError();
    const profile = wahooUserProfileSchema.safeParse(await userResponse.json());
    if (!profile.success || profile.data.id == null) throw new WahooOAuthIdentityError();
    return { externalId: profile.data.id.toString(), requiresActivation: false };
  } catch (error) {
    if (error instanceof WahooOAuthIdentityError) throw error;
    throw new WahooOAuthIdentityError();
  }
}

export function classifyWahooOAuthFailure(error: unknown) {
  if (error instanceof WahooOAuthIdentityError) {
    return {
      kind: "identity" as const,
      code: "provider_identity_failed",
      message: "Provider account identity could not be verified",
    };
  }
  const detail = error instanceof WahooOAuthTokenExchangeError ? error.detail : undefined;
  return detail === "wahoo_token_limit_exceeded"
    ? {
        kind: "exchange" as const,
        code: "wahoo_token_limit_exceeded",
        message:
          "This account has too many active GradientPeak authorizations. Revoke an older authorization with the provider, then try again.",
        reason: detail,
      }
    : {
        kind: "exchange" as const,
        code: "token_exchange_failed",
        message: "Integration connection failed",
        reason: detail,
      };
}
