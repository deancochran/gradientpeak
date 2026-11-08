import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export type IsolatedSupabaseDiffWorkdir = {
  projectId: string;
  root: string;
  shadowPort: number;
};

export type IsolatedSupabaseDiffOptions = {
  sourceSupabaseRoot: string;
  temporaryParent?: string;
};

function replaceConfigValue(config: string, key: string, value: string) {
  const pattern = new RegExp(`^${key}\\s*=\\s*[^\\n]+`, "m");
  if (!pattern.test(config)) throw new Error(`Supabase config is missing ${key}.`);
  return config.replace(pattern, `${key} = ${value}`);
}

function replaceSectionPort(config: string, section: string, key: string, port: number) {
  const sectionPattern = new RegExp(
    `(\\[${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\][\\s\\S]*?)(?=\\n\\[|$)`,
  );
  const sectionMatch = config.match(sectionPattern);
  if (!sectionMatch?.[1]) throw new Error(`Supabase config is missing [${section}].`);
  const keyPattern = new RegExp(`^${key}\\s*=\\s*\\d+`, "m");
  if (!keyPattern.test(sectionMatch[1])) {
    throw new Error(`Supabase config [${section}] is missing ${key}.`);
  }
  return config.replace(sectionPattern, sectionMatch[1].replace(keyPattern, `${key} = ${port}`));
}

/** Reserves an available loopback port long enough to learn it; the CLI binds it immediately after. */
async function chooseLoopbackPort(excludedPorts: ReadonlySet<number>) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const server = createServer();
    await new Promise<void>((resolvePort, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolvePort());
    });
    try {
      const address = server.address();
      if (!address || typeof address === "string" || address.port < 1 || address.port > 65_535) {
        throw new Error("could not reserve an ephemeral loopback shadow port");
      }
      if (!excludedPorts.has(address.port)) return address.port;
    } finally {
      await new Promise<void>((resolveClose, reject) =>
        server.close((error) => (error ? reject(error) : resolveClose())),
      );
    }
  }
  throw new Error("could not choose a distinct ephemeral loopback shadow port");
}

/**
 * Makes a per-invocation CLI project containing only the authoritative config and
 * migrations. A distinct project ID isolates the CLI's Docker resources; a fresh
 * loopback shadow port prevents concurrent `db diff` calls from sharing port 54320.
 */
export async function createIsolatedSupabaseDiffWorkdir(
  options: IsolatedSupabaseDiffOptions,
  excludedPorts: ReadonlySet<number> = new Set(),
): Promise<IsolatedSupabaseDiffWorkdir> {
  const sourceRoot = resolve(options.sourceSupabaseRoot);
  const sourceConfig = resolve(sourceRoot, "config.toml");
  const sourceMigrations = resolve(sourceRoot, "migrations");
  if (!existsSync(sourceConfig) || !existsSync(sourceMigrations)) {
    throw new Error("authoritative Supabase config.toml and migrations are required for db diff");
  }

  const root = mkdtempSync(join(options.temporaryParent ?? tmpdir(), "gradientpeak-fresh-diff-"));
  try {
    const shadowPort = await chooseLoopbackPort(excludedPorts);
    const projectId = `gradientpeak_fresh_diff_${randomUUID().replaceAll("-", "")}`;
    let config = readFileSync(sourceConfig, "utf8");
    config = replaceConfigValue(config, "project_id", JSON.stringify(projectId));
    config = replaceSectionPort(config, "db", "shadow_port", shadowPort);

    const supabaseRoot = join(root, "supabase");
    mkdirSync(supabaseRoot);
    writeFileSync(join(supabaseRoot, "config.toml"), config);
    symlinkSync(sourceMigrations, join(supabaseRoot, "migrations"), "dir");
    return { projectId, root, shadowPort };
  } catch (error) {
    rmSync(root, { force: true, recursive: true });
    throw error;
  }
}

export function cleanupIsolatedSupabaseDiffWorkdir(workdir: IsolatedSupabaseDiffWorkdir) {
  rmSync(workdir.root, { force: true, recursive: true });
}

export function isRetryableShadowPortAllocationFailure(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  // biome-ignore lint/security/noSecrets: Supabase CLI's public error class, not a credential.
  if (!detail.includes("LegacyShadowDbError")) return false;
  return (
    /Bind for [^\n]+ failed: port is already allocated/i.test(detail) ||
    (/address already in use/i.test(detail) && /shadow/i.test(detail))
  );
}

type IsolatedSupabaseDiffDependencies = {
  cleanup: (workdir: IsolatedSupabaseDiffWorkdir) => void;
  create: (
    options: IsolatedSupabaseDiffOptions,
    excludedPorts: ReadonlySet<number>,
  ) => Promise<IsolatedSupabaseDiffWorkdir>;
};

const defaultDependencies: IsolatedSupabaseDiffDependencies = {
  cleanup: cleanupIsolatedSupabaseDiffWorkdir,
  create: createIsolatedSupabaseDiffWorkdir,
};

/**
 * Retries only the observed legacy shadow-container port allocation race. Every
 * attempt receives a new owned project/workdir and a port distinct from prior attempts.
 */
export async function runIsolatedSupabaseDiff<T>(
  options: IsolatedSupabaseDiffOptions,
  run: (workdir: IsolatedSupabaseDiffWorkdir) => Promise<T> | T,
  dependencies: IsolatedSupabaseDiffDependencies = defaultDependencies,
): Promise<T> {
  const excludedPorts = new Set<number>();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const workdir = await dependencies.create(options, excludedPorts);
    try {
      return await run(workdir);
    } catch (error) {
      if (!isRetryableShadowPortAllocationFailure(error) || attempt === 1) throw error;
      excludedPorts.add(workdir.shadowPort);
    } finally {
      dependencies.cleanup(workdir);
    }
  }
  throw new Error("unreachable isolated Supabase diff retry state");
}
