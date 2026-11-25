import type { TestInfo } from "@playwright/test";

import type { LocalE2EDatabase } from "./database";

type ExactCleanup = {
  cleanup: (database: LocalE2EDatabase) => Promise<void>;
  id: string;
  kind: string;
};

let activeRegistry: E2ECleanupRegistry | undefined;
const cleanupActionMetadata = new WeakMap<Error, { id: string; kind: string }>();

function safeMetadata(value: string, fallback: string) {
  return /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : fallback;
}

function formatCleanupDiagnostic(error: unknown) {
  const lines: string[] = [];
  const seen = new Set<unknown>();
  const append = (value: unknown, indent = "", depth = 0): void => {
    if (depth > 8) {
      lines.push(`${indent}[cause depth exceeded]`);
      return;
    }
    if (value === null) {
      lines.push(`${indent}Thrown: null`);
      return;
    }
    if (typeof value !== "object") {
      lines.push(`${indent}Thrown: ${typeof value}`);
      return;
    }
    if (seen.has(value)) {
      lines.push(`${indent}[circular cause]`);
      return;
    }
    seen.add(value);
    if (value instanceof AggregateError) {
      lines.push(`${indent}AggregateError`);
      for (const nested of value.errors) append(nested, `${indent}  `, depth + 1);
      return;
    }
    if (value instanceof Error) {
      const action = cleanupActionMetadata.get(value);
      const code =
        "code" in value && typeof value.code === "string"
          ? safeMetadata(value.code, "<redacted-code>")
          : undefined;
      lines.push(
        action
          ? `${indent}cleanup ${safeMetadata(action.kind, "<redacted-kind>")} ${safeMetadata(action.id, "<redacted-id>")}`
          : `${indent}${safeMetadata(value.name, "Error")}${code ? ` [${code}]` : ""}`,
      );
      if ("cause" in value) {
        lines.push(`${indent}  cause:`);
        append(value.cause, `${indent}    `, depth + 1);
      }
      return;
    }
    lines.push(`${indent}Thrown: object`);
  };
  append(error);
  return lines.join("\n");
}

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
        const failure = new Error(`Could not clean ${action.kind} ${action.id}`, { cause: error });
        if (!("cause" in failure)) Object.assign(failure, { cause: error });
        cleanupActionMetadata.set(failure, { id: action.id, kind: action.kind });
        failures.push(failure);
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
      const detail = formatCleanupDiagnostic(cleanupError);
      const description = detail.split("\n", 1)[0];
      testInfo.annotations.push({
        type: "cleanup-error",
        ...(description === undefined ? {} : { description }),
      });
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
