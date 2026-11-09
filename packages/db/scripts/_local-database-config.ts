import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));

export const dbPackageRoot = resolve(scriptDir, "..");
export const repoRoot = resolve(dbPackageRoot, "../..");
export const supabaseCliRoot = resolve(dbPackageRoot, "supabase");
// biome-ignore lint/security/noSecrets: fixed credentials for the repository-owned local Supabase container
export const defaultLocalDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
