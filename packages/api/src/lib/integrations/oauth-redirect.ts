type OAuthRedirectEnv = Record<string, string | undefined>;

const DEVELOPMENT_MOBILE_OAUTH_REDIRECT = "gradientpeak-dev://integrations";
const PRODUCTION_MOBILE_OAUTH_REDIRECT = "gradientpeak://integrations";

export function getDefaultMobileOAuthRedirect(env: OAuthRedirectEnv = process.env): string {
  return (
    env.OAUTH_MOBILE_CALLBACK_URL?.trim() ||
    (env.NODE_ENV === "production"
      ? PRODUCTION_MOBILE_OAUTH_REDIRECT
      : DEVELOPMENT_MOBILE_OAUTH_REDIRECT)
  );
}
