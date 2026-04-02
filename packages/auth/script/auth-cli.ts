/**
 * CLI-only Better Auth schema generation config.
 * Do not import this file in runtime code.
 */

import { createGradientPeakAuth } from "../src/runtime/server";

export const auth = createGradientPeakAuth({
  appUrl: "http://localhost:3000",
  databaseUrl:
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  mobileScheme: "gradientpeak",
  secret: "secret",
  trustedOrigins: ["http://localhost:3000"],
});
