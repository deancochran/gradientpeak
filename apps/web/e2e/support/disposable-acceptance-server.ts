import { lstatSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isAbsolute, resolve } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { localE2EDatabaseEnvironment, type WebE2EDatabaseEnvironment } from "./database-url";

export function requireDisposableAcceptanceEnvironment(
  environment: WebE2EDatabaseEnvironment = process.env,
) {
  if (environment.E2E_DISPOSABLE_DATABASE !== "1")
    throw new Error("Acceptance server requires the disposable runner environment.");
  return localE2EDatabaseEnvironment(environment);
}

export function disposableAcceptanceLeaseMiddleware(
  validate: () => unknown = requireDisposableAcceptanceEnvironment,
) {
  return (_request: IncomingMessage, response: ServerResponse, next: () => void) => {
    try {
      validate();
      next();
    } catch {
      // Do not reveal the lease, target, or failure detail to a browser response.
      response.statusCode = 503;
      response.end("Acceptance runner ownership is unavailable.");
    }
  };
}

export function disposableAcceptanceLeaseVitePlugin(): Plugin {
  return {
    name: "disposable-acceptance-lease-gate",
    enforce: "pre" as const,
    configureServer(server: ViteDevServer) {
      server.middlewares.use(disposableAcceptanceLeaseMiddleware());
    },
  };
}

export function requirePrivatePlaywrightArtifactDirectory(
  artifacts: string | undefined,
  outputDir: string | undefined,
) {
  if (
    !artifacts ||
    !outputDir ||
    !isAbsolute(artifacts) ||
    outputDir !== resolve(artifacts, "playwright")
  )
    throw new Error("Acceptance requires a runner-owned Playwright artifact directory.");
  const artifactsStatus = lstatSync(artifacts);
  const outputStatus = lstatSync(outputDir);
  if (
    !artifactsStatus.isDirectory() ||
    artifactsStatus.isSymbolicLink() ||
    (Number(artifactsStatus.mode) & 0o777) !== 0o700 ||
    !outputStatus.isDirectory() ||
    outputStatus.isSymbolicLink() ||
    (typeof process.getuid === "function" &&
      (artifactsStatus.uid !== process.getuid() || outputStatus.uid !== process.getuid()))
  )
    throw new Error("Acceptance Playwright artifact directory is not runner-owned and private.");
  return outputDir;
}
