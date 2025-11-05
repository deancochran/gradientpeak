import { getDynamicAppConfig } from "app.config";

// Get the current app scheme based on environment
export const getAppScheme = () => {
  const environment =
    (process.env.APP_ENV as "development" | "preview" | "production") ||
    "development";
  const config = getDynamicAppConfig(environment);
  const scheme = `${config.scheme}://`;

  return scheme;
};
