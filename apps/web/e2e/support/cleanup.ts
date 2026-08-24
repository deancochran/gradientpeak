import type { TestInfo } from "@playwright/test";

import type { LocalE2EDatabase } from "./database";

type ExactCleanup = {
  cleanup: (database: LocalE2EDatabase) => Promise<void>;
  id: string;
  kind: string;
};

let activeRegistry: E2ECleanupRegistry | undefined;

export class E2ECleanupRegistry {
  readonly #actions = new Map<string, ExactCleanup>();

  registerExactId(action: ExactCleanup) {
    const kind = action.kind.trim();
    const id = action.id.trim();
    if (!kind || !id) throw new Error("E2E cleanup requires a non-empty record kind and exact ID.");
    this.#actions.set(`${kind}:${id}`, { ...action, id, kind });
    return id;
  }

  get size() {
    return this.#actions.size;
  }

  async cleanup(database: LocalE2EDatabase) {
    const actions = [...this.#actions.values()].reverse();
    this.#actions.clear();
    const failures: Error[] = [];
    for (const action of actions) {
      try {
        await action.cleanup(database);
      } catch (error) {
        failures.push(
          new Error(`Could not clean ${action.kind} ${action.id}`, {
            cause: error,
          }),
        );
      }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1)
      throw new AggregateError(failures, "Multiple E2E records could not be cleaned");
  }
}

export function activateE2ECleanupRegistry(registry: E2ECleanupRegistry) {
  if (activeRegistry) throw new Error("An E2E cleanup registry is already active in this worker.");
  activeRegistry = registry;
  return () => {
    if (activeRegistry === registry) activeRegistry = undefined;
  };
}

export function currentE2ECleanupRegistry() {
  if (!activeRegistry)
    throw new Error("Exact E2E cleanup registration requires the shared fixture.");
  return activeRegistry;
}

export async function runCleanupFixture(
  registry: E2ECleanupRegistry,
  database: LocalE2EDatabase,
  testInfo: TestInfo,
  use: () => Promise<void>,
) {
  let primaryError: unknown;
  const deactivate = activateE2ECleanupRegistry(registry);
  try {
    await use();
  } catch (error) {
    primaryError = error;
  } finally {
    deactivate();
  }

  try {
    await registry.cleanup(database);
  } catch (cleanupError) {
    if (primaryError !== undefined || testInfo.status !== testInfo.expectedStatus) {
      const detail =
        cleanupError instanceof Error
          ? cleanupError.stack || cleanupError.message
          : String(cleanupError);
      testInfo.annotations.push({ type: "cleanup-error", description: detail.split("\n", 1)[0] });
      await testInfo
        .attach("e2e-cleanup-error.txt", {
          body: Buffer.from(detail),
          contentType: "text/plain",
        })
        .catch(() => undefined);
    } else {
      throw cleanupError;
    }
  }

  if (primaryError !== undefined) throw primaryError;
}
