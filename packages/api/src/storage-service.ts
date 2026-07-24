import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ActivityArtifactStorage } from "./application/activity-file-ingestion/artifact-storage";

let apiStorageServiceSingleton: SupabaseClient | null = null;
let activityArtifactStorageSingleton: ActivityArtifactStorage | null = null;

const ACTIVITY_ARTIFACT_READ_TIMEOUT_MS = 30_000;
const MAX_CONTENT_TYPE_LENGTH = 256;

function resolveApiStorageServiceConfig() {
  const url = process.env.NEXT_PRIVATE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "API storage service requires NEXT_PRIVATE_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and NEXT_PRIVATE_SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return { serviceRoleKey, url };
}

function objectUrl(url: string, bucket: string, path: string) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${url.replace(/\/$/, "")}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;
}

function declaredContentLength(response: Response): number | undefined {
  const value = response.headers.get("content-length");
  if (!value || !/^\d+$/.test(value)) return undefined;
  const length = Number(value);
  return Number.isSafeInteger(length) ? length : undefined;
}

export function createActivityArtifactStorageService(input: {
  url: string;
  serviceRoleKey: string;
  storage: ActivityArtifactStorage["storage"];
  fetch?: typeof fetch;
  timeoutMs?: number;
}): ActivityArtifactStorage {
  const fetchImplementation = input.fetch ?? globalThis.fetch;
  if (typeof fetchImplementation !== "function" || typeof ReadableStream !== "function") {
    throw new Error("Activity artifact storage requires streaming fetch support.");
  }

  return {
    storage: input.storage,
    async readObjectBounded({ bucket, path, maxBytes }) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        input.timeoutMs ?? ACTIVITY_ARTIFACT_READ_TIMEOUT_MS,
      );
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

      try {
        const response = await fetchImplementation(objectUrl(input.url, bucket, path), {
          headers: {
            apikey: input.serviceRoleKey,
            authorization: `Bearer ${input.serviceRoleKey}`,
          },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error("Failed to read activity artifact from storage.");
        }

        const contentLength = declaredContentLength(response);
        if (contentLength !== undefined && contentLength > maxBytes) {
          controller.abort();
          throw new Error("Activity artifact exceeds the allowed size.");
        }

        reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let byteLength = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          byteLength += value.byteLength;
          if (byteLength > maxBytes) {
            controller.abort();
            await reader.cancel();
            throw new Error("Activity artifact exceeds the allowed size.");
          }
          chunks.push(value);
        }

        const data = new Uint8Array(byteLength);
        let offset = 0;
        for (const chunk of chunks) {
          data.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return {
          data,
          contentType: (response.headers.get("content-type") ?? "").slice(
            0,
            MAX_CONTENT_TYPE_LENGTH,
          ),
          ...(contentLength === undefined ? {} : { contentLength }),
        };
      } catch (error) {
        if (
          error instanceof Error &&
          /^Activity artifact (exceeds|storage requires)/.test(error.message)
        ) {
          throw error;
        }
        throw new Error("Failed to read activity artifact from storage.");
      } finally {
        clearTimeout(timeout);
        if (reader) reader.releaseLock();
      }
    },
  };
}

/**
 * Backend-owned storage provider for API file flows.
 * This is intentionally a storage concern, not a relational query client.
 */
export function getApiStorageService() {
  if (!apiStorageServiceSingleton) {
    const { serviceRoleKey, url } = resolveApiStorageServiceConfig();
    apiStorageServiceSingleton = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return apiStorageServiceSingleton as any;
}

/** Server-only adapter for private activity artifacts with bounded streaming reads. */
export function getActivityArtifactStorageService(): ActivityArtifactStorage {
  if (!activityArtifactStorageSingleton) {
    const { serviceRoleKey, url } = resolveApiStorageServiceConfig();
    const genericStorage = getApiStorageService();
    activityArtifactStorageSingleton = createActivityArtifactStorageService({
      url,
      serviceRoleKey,
      storage: genericStorage.storage,
    });
  }
  if (!activityArtifactStorageSingleton) {
    throw new Error("Activity artifact storage is unavailable.");
  }
  return activityArtifactStorageSingleton;
}
