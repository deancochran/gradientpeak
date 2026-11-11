import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Plugin, resolveConfig } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import {
  disposableAcceptanceLeaseMiddleware,
  disposableAcceptanceLeaseVitePlugin,
  requireDisposableAcceptanceEnvironment,
  requirePrivatePlaywrightArtifactDirectory,
} from "./disposable-acceptance-server";

const servers: Array<ReturnType<typeof createServer>> = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))),
  );
  for (const directory of directories.splice(0))
    rmSync(directory, { force: true, recursive: true });
});

describe("disposable acceptance server guard", () => {
  it("rejects an acceptance Vite invocation without the disposable runner flag", () => {
    expect(() => requireDisposableAcceptanceEnvironment({})).toThrow(
      /disposable runner environment/,
    );
  });

  it("registers the lease gate as a pre plugin before base server responders", async () => {
    const plugin = disposableAcceptanceLeaseVitePlugin();
    expect(plugin.enforce).toBe("pre");
    const baseResponder: Plugin = { name: "base-server-responder" };
    const resolved = await resolveConfig({ plugins: [baseResponder, plugin] }, "serve");
    expect(resolved.plugins.findIndex((entry) => entry.name === plugin.name)).toBeLessThan(
      resolved.plugins.findIndex((entry) => entry.name === baseResponder.name),
    );
  });

  it("refuses new requests after the runner owner dies", async () => {
    let ownerLive = true;
    const middleware = disposableAcceptanceLeaseMiddleware(() => {
      if (!ownerLive) throw new Error("synthetic owner death");
    });
    const server = createServer((request, response) =>
      middleware(request, response, () => response.end("accepted")),
    );
    servers.push(server);
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    const origin = `http://127.0.0.1:${address.port}`;

    expect(await (await fetch(origin)).text()).toBe("accepted");
    ownerLive = false;
    const rejected = await fetch(origin);
    expect(rejected.status).toBe(503);
    expect(await rejected.text()).toBe("Acceptance runner ownership is unavailable.");
  });

  it("keeps Playwright output private when cleanup recreates its child directory", () => {
    const artifacts = mkdtempSync(join(tmpdir(), "gradientpeak-artifacts-"));
    directories.push(artifacts);
    chmodSync(artifacts, 0o700);
    const output = join(artifacts, "playwright");
    mkdirSync(output, { mode: 0o700 });
    expect(requirePrivatePlaywrightArtifactDirectory(artifacts, output)).toBe(output);

    // Playwright removes outputDir and recreates it with the process default mode.
    chmodSync(output, 0o755);
    expect(requirePrivatePlaywrightArtifactDirectory(artifacts, output)).toBe(output);
    chmodSync(artifacts, 0o755);
    expect(() => requirePrivatePlaywrightArtifactDirectory(artifacts, output)).toThrow(/private/);
  });

  it("rejects a symbolic-link output directory", () => {
    const artifacts = mkdtempSync(join(tmpdir(), "gradientpeak-artifacts-"));
    directories.push(artifacts);
    chmodSync(artifacts, 0o700);
    const target = mkdtempSync(join(tmpdir(), "gradientpeak-output-"));
    directories.push(target);
    symlinkSync(target, join(artifacts, "playwright"));
    expect(() =>
      requirePrivatePlaywrightArtifactDirectory(artifacts, join(artifacts, "playwright")),
    ).toThrow(/private/);
  });
});
