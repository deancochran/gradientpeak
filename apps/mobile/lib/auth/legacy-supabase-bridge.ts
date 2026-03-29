type CallbackParams = Record<string, string | string[] | undefined>;

export interface LegacySupabaseBridgeTokens {
  accessToken: string;
  refreshToken: string;
}

function readFirstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getLegacySupabaseBridgeTokens(
  params: CallbackParams,
): LegacySupabaseBridgeTokens | null {
  const accessToken = readFirstParam(params.access_token);
  const refreshToken = readFirstParam(params.refresh_token);

  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
  };
}
