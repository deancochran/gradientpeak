import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { Pool } from "pg";
import {
  attestCleanup,
  attestStorageContainer,
  buildStorageContainerSpec,
} from "./verify-isolated-storage-api";

export {
  applySqlFile,
  bootstrapSupabaseAuthSchema,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
export { requireFreshBaseline } from "./baseline-workflow";

type ContainerInspect = {
  Config?: { Env?: string[] };
  NetworkSettings?: { Networks?: Record<string, unknown> };
};
type ImageInspect = { Id?: string; RepoDigests?: string[] };

function dockerJson(args: string[]): unknown {
  return JSON.parse(
    execFileSync("docker", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }),
  );
}

async function waitForStorageApi(baseUrl: string, containerName: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const running =
      spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", containerName], {
        encoding: "utf8",
      }).stdout.trim() === "true";
    if (!running) throw new Error("disposable Storage API exited before readiness");
    try {
      const response = await fetch(`${baseUrl}/status`);
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("disposable Storage API readiness timed out");
}

async function waitForStorageMigrations(pool: Pool) {
  let previousCount = -1;
  let stableReads = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await pool.query<{ count: number }>(`
      select case
        when to_regclass('storage.migrations') is null then 0
        else (select count(*)::integer from storage.migrations)
      end count
    `);
    const count = result.rows[0]?.count ?? 0;
    stableReads = count > 0 && count === previousCount ? stableReads + 1 : 0;
    if (stableReads >= 3) return;
    previousCount = count;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("disposable Storage API migrations did not stabilize");
}

async function requestBytes(request: IncomingMessage): Promise<Uint8Array | undefined> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length === 0 ? undefined : Buffer.concat(chunks);
}

async function proxyStorageRequest(
  request: IncomingMessage,
  response: ServerResponse,
  directBaseUrl: string,
) {
  try {
    const path = (request.url ?? "/").replace(/^\/storage\/v1(?=\/|$)/, "");
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (name === "host" || value === undefined) continue;
      if (Array.isArray(value)) {
        for (const entry of value) headers.append(name, entry);
      } else headers.set(name, value);
    }
    const body = await requestBytes(request);
    const bodyBuffer =
      body === undefined
        ? undefined
        : (() => {
            const buffer = new ArrayBuffer(body.byteLength);
            new Uint8Array(buffer).set(body);
            return buffer;
          })();
    const upstream = await fetch(`${directBaseUrl}${path}`, {
      method: request.method ?? "GET",
      headers,
      ...(bodyBuffer === undefined ? {} : { body: bodyBuffer }),
    });
    const bytes = Buffer.from(await upstream.arrayBuffer());
    response.statusCode = upstream.status;
    const contentType = upstream.headers.get("content-type");
    if (contentType) response.setHeader("content-type", contentType);
    response.setHeader("content-length", bytes.byteLength);
    response.end(bytes);
  } catch {
    response.statusCode = 502;
    response.end();
  }
}

async function startGatewayProxy(directBaseUrl: string) {
  const server = createServer((request, response) => {
    void proxyStorageRequest(request, response, directBaseUrl);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo | null;
  if (!address) throw new Error("disposable Storage gateway proxy has no address");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/**
 * Runs a real, isolated Supabase Storage API against one guarded disposable DB.
 * The tiny loopback proxy reproduces the repository gateway's `/storage/v1` mount.
 */
export async function withDisposableSupabaseStorage<T>(
  pool: Pool,
  connectionString: string,
  run: (storage: { url: string; serviceRoleKey: string }) => Promise<T>,
): Promise<T> {
  const sourceContainerName = "supabase_storage_gradientpeak";
  const source = (dockerJson(["inspect", sourceContainerName]) as ContainerInspect[])[0];
  const sourceEnvironment = source?.Config?.Env;
  const network = Object.keys(source?.NetworkSettings?.Networks ?? {})[0];
  if (!sourceEnvironment || !network) {
    throw new Error("repository-managed local Storage API inspection failed");
  }
  const storageRoot = mkdtempSync(join(realpathSync("/tmp/opencode"), "gradientpeak-storage-"));
  const containerName = `gradientpeak-storage-disposable-${process.pid}-${Date.now()}`;
  const spec = buildStorageContainerSpec({
    name: containerName,
    network,
    storageRoot,
    databaseUrl: connectionString,
    sourceEnvironment,
  });
  const database = new URL(connectionString).pathname.slice(1);
  if (!/^gradientpeak_[a-z_]+_\d+_\d+$/.test(database)) {
    throw new Error("Storage API target is not a guarded disposable database");
  }
  const sourceDatabaseUrl = sourceEnvironment
    .find((entry) => entry.startsWith("DATABASE_URL="))
    ?.slice("DATABASE_URL=".length);
  const storageRole = sourceDatabaseUrl ? new URL(sourceDatabaseUrl).username : "";
  if (!/^[a-z_][a-z0-9_]*$/.test(storageRole)) {
    throw new Error("reviewed local Storage API database role is invalid");
  }
  await pool.query(`grant create on database "${database}" to "${storageRole}"`);

  let proxy: Awaited<ReturnType<typeof startGatewayProxy>> | undefined;
  try {
    const command = [
      "run",
      "-d",
      "--name",
      spec.name,
      "--network",
      spec.network,
      "-p",
      "127.0.0.1::5000",
      "-v",
      `${spec.mount.source}:${spec.mount.destination}`,
    ];
    for (const environment of spec.environment) command.push("-e", environment);
    command.push(spec.image);
    execFileSync("docker", command, { stdio: "ignore" });
    const inspect = (
      dockerJson(["inspect", spec.name]) as Parameters<typeof attestStorageContainer>[0][]
    )[0];
    const imageInspect = (dockerJson(["image", "inspect", spec.image]) as ImageInspect[])[0];
    if (!inspect || !imageInspect) throw new Error("disposable Storage API attestation failed");
    attestStorageContainer(inspect, imageInspect, spec);
    const port = execFileSync("docker", ["port", spec.name, "5000/tcp"], {
      encoding: "utf8",
    })
      .trim()
      .match(/:(\d+)$/)?.[1];
    if (!port) throw new Error("disposable Storage API has no loopback port");
    const directBaseUrl = `http://127.0.0.1:${port}`;
    await waitForStorageApi(directBaseUrl, spec.name);
    await waitForStorageMigrations(pool);
    const storageAdminUrl = new URL(connectionString);
    const sourceDatabase = new URL(sourceDatabaseUrl ?? "");
    storageAdminUrl.username = sourceDatabase.username;
    storageAdminUrl.password = sourceDatabase.password;
    const storageAdmin = new Pool({ connectionString: storageAdminUrl.toString(), max: 1 });
    try {
      await storageAdmin.query(`
        grant usage on schema storage to service_role;
        grant select, insert, update, delete on all tables in schema storage to service_role;
        grant usage, select on all sequences in schema storage to service_role;
      `);
    } finally {
      await storageAdmin.end();
    }
    const serviceRoleKey = spec.environment
      .find((entry) => entry.startsWith("SERVICE_KEY="))
      ?.slice("SERVICE_KEY=".length);
    if (!serviceRoleKey) throw new Error("reviewed local Storage API lacks a service credential");
    const privileges = await pool.query<{ service_schema: boolean; storage_schema: boolean }>(`
      select
        has_schema_privilege('service_role', 'storage', 'usage') service_schema,
        has_schema_privilege('${storageRole}', 'storage', 'usage') storage_schema
    `);
    if (!privileges.rows[0]?.service_schema || !privileges.rows[0]?.storage_schema) {
      throw new Error(
        `disposable Storage API schema grants are incomplete (${JSON.stringify(privileges.rows[0])})`,
      );
    }
    proxy = await startGatewayProxy(directBaseUrl);
    return await run({ url: proxy.url, serviceRoleKey });
  } finally {
    await proxy?.close().catch(() => undefined);
    spawnSync("docker", ["exec", spec.name, "chmod", "-R", "a+rwx", "/mnt"], {
      stdio: "ignore",
    });
    const removed = spawnSync("docker", ["rm", "-f", spec.name], { stdio: "ignore" });
    const remaining = execFileSync(
      "docker",
      ["ps", "-a", "--filter", `name=${spec.name}`, "--format", "{{.Names}}"],
      { encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean);
    attestCleanup(spec.name, removed.status, remaining);
    rmSync(storageRoot, { recursive: true, force: true });
  }
}
