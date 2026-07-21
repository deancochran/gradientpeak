import { type ChildProcess, spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test as sharedTest } from "../../fixtures";
import {
  AuthArtifactRegistry,
  activatePlaywrightAuthArtifactRegistry,
  cleanupAuthArtifacts,
} from "./artifact-registry";

type LaneServer = { baseURL: string; process: ChildProcess };
type AuthLaneFixtures = { authArtifactRegistry: AuthArtifactRegistry };

async function waitUntilReady(baseURL: string, child: ChildProcess) {
  const deadline = Date.now() + 30_000;
  let output = "";
  child.stdout?.on("data", (chunk) => {
    output = `${output}${String(chunk)}`.slice(-4000);
  });
  child.stderr?.on("data", (chunk) => {
    output = `${output}${String(chunk)}`.slice(-4000);
  });
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Auth lane server exited with ${child.exitCode}`);
    try {
      const response = await fetch(`${baseURL}/auth/login`);
      if (response.ok) return;
    } catch {
      // Vite has not opened the socket yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out starting the auth lane server: ${output}`);
}

async function stopLaneServer(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const signal = (value: NodeJS.Signals) => {
    if (process.platform !== "win32" && child.pid) {
      try {
        process.kill(-child.pid, value);
        return;
      } catch {
        // Fall back to signaling the direct child.
      }
    }
    child.kill(value);
  };
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  signal("SIGTERM");
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (child.exitCode === null && child.signalCode === null) {
    signal("SIGKILL");
    await exited;
  }
}

export const test = sharedTest.extend<AuthLaneFixtures, { laneServer: LaneServer }>({
  authArtifactRegistry: [
    async ({ laneServer: _laneServer }, use, testInfo) => {
      const registry = new AuthArtifactRegistry();
      const deactivateRegistry = activatePlaywrightAuthArtifactRegistry(registry);
      let primaryError: unknown;
      try {
        await use(registry);
      } catch (error) {
        primaryError = error;
      } finally {
        deactivateRegistry();
      }

      try {
        await cleanupAuthArtifacts(registry.drain());
      } catch (cleanupError) {
        if (primaryError !== undefined || testInfo.status !== "passed") {
          const description =
            cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
          testInfo.annotations.push({ type: "auth-cleanup-error", description });
          await testInfo
            .attach("auth-cleanup-error.txt", {
              body: Buffer.from(
                cleanupError instanceof Error
                  ? cleanupError.stack || cleanupError.message
                  : String(cleanupError),
              ),
              contentType: "text/plain",
            })
            .catch(() => undefined);
        } else {
          throw cleanupError;
        }
      }

      if (primaryError !== undefined) throw primaryError;
    },
    { auto: true },
  ],
  laneServer: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture callbacks require object destructuring.
    async ({}, use, workerInfo) => {
      const port = 32_000 + (process.pid % 1_000) * 10 + workerInfo.workerIndex;
      const baseURL = `http://127.0.0.1:${port}`;
      const capturePath = `/tmp/gradientpeak-auth-mail-${process.pid}-${workerInfo.workerIndex}.jsonl`;
      const secret = "gradientpeak-playwright-lane-secret-that-is-long-and-test-only";
      await rm(capturePath, { force: true });
      process.env.AUTH_EMAIL_CAPTURE_PATH = capturePath;
      process.env.BETTER_AUTH_SECRET = secret;
      const child = spawn(
        "pnpm",
        ["exec", "vite", "dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
        {
          cwd: fileURLToPath(new URL("../../..", import.meta.url)),
          detached: process.platform !== "win32",
          env: {
            ...process.env,
            NODE_ENV: "test",
            AUTH_EMAIL_MODE: "capture",
            AUTH_EMAIL_CAPTURE_PATH: capturePath,
            BETTER_AUTH_SECRET: secret,
            NODE_OPTIONS: [process.env.NODE_OPTIONS, "--preserve-symlinks"]
              .filter(Boolean)
              .join(" "),
            DATABASE_URL:
              process.env.DATABASE_URL ??
              process.env.POSTGRES_URL ??
              // biome-ignore lint/security/noSecrets: Supabase's documented disposable local database URL.
              "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
          },
          stdio: "pipe",
        },
      );
      try {
        await waitUntilReady(baseURL, child);
        await use({ baseURL, process: child });
      } finally {
        await stopLaneServer(child);
        await rm(capturePath, { force: true });
      }
    },
    { scope: "worker", auto: true, timeout: 120_000 },
  ],
  page: async ({ authArtifactRegistry: _registry, browser, laneServer }, use, testInfo) => {
    const projectUse = testInfo.project.use as {
      viewport?: { width: number; height: number } | null;
    };
    const context = await browser.newContext({
      baseURL: laneServer.baseURL,
      viewport: projectUse.viewport ?? { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    try {
      await use(page);
    } finally {
      await context.close();
    }
  },
});

export { expect };
