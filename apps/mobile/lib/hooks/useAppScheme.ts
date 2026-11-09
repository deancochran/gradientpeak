type AppEnvironment = "development" | "preview" | "production";

const SCHEME_BY_ENVIRONMENT: Record<AppEnvironment, string> = {
  development: "gradientpeak-dev",
  preview: "gradientpeak-prev",
  production: "gradientpeak",
};

// Get the current app scheme based on environment
export const getAppScheme = () => {
  const environment = (process.env.APP_ENV as AppEnvironment) || "development";
  return SCHEME_BY_ENVIRONMENT[environment] ?? SCHEME_BY_ENVIRONMENT.development;
};
