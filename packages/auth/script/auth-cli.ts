/**
 * CLI-only Better Auth schema generation config.
 * Do not import this file in runtime code.
 */

import { resolveDatabaseUrl } from "@repo/db/client";
import { createGradientPeakAuth } from "../src/runtime/server";

export const auth = createGradientPeakAuth({
  appUrl: "http://localhost:3000",
  databaseUrl: resolveDatabaseUrl(process.env),
  mobileScheme: "gradientpeak",
  secret: "secret",
  trustedOrigins: ["http://localhost:3000"],
});
