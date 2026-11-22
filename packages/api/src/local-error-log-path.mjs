import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const LOCAL_ERROR_LOG_DIRECTORY = resolve(REPO_ROOT, ".logs");
export const DEFAULT_LOCAL_ERROR_LOG_PATH = resolve(LOCAL_ERROR_LOG_DIRECTORY, "dev-errors.jsonl");

export function getLocalErrorLogPath(value = process.env.LOCAL_ERROR_LOG_PATH) {
  if (!value) return DEFAULT_LOCAL_ERROR_LOG_PATH;
  if (!isAbsolute(value)) return null;

  const path = resolve(value);
  return dirname(path) === LOCAL_ERROR_LOG_DIRECTORY &&
    /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(path.split("/").at(-1) ?? "")
    ? path
    : null;
}
