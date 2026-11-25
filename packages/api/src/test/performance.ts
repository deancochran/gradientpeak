import { performance } from "node:perf_hooks";

export type EndpointPerformanceResult = {
  durationMs: number;
  status: "fulfilled" | "rejected";
  error?: unknown;
};

export type EndpointPerformanceBudget = {
  path: string;
  type: "mutation" | "query" | "subscription";
  budgetMs: number;
};

type RouterWithProcedures = {
  _def: object;
};

type EndpointProcedure = {
  inputs?: unknown[];
  type: EndpointPerformanceBudget["type"];
};

const UUID_VALUE = "11111111-1111-4111-8111-111111111111";
const OTHER_UUID_VALUE = "22222222-2222-4222-8222-222222222222";

export const ENDPOINT_PERFORMANCE_TIMEOUT_MS = 2_000;

export function getEndpointPerformanceBudgets(router: RouterWithProcedures) {
  return getPerformanceProcedures(getRouterRecord(router))
    .map(([path, procedure]) => ({
      path,
      type: procedure.type,
      budgetMs: getBudgetMs(path, procedure.type),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function createMockInputForProcedure(procedure: EndpointProcedure) {
  const inputSchema = procedure.inputs?.[0];
  if (!inputSchema) return undefined;

  return createMockValue(inputSchema, "input");
}

export function getEndpointPerformanceProcedure(router: RouterWithProcedures, path: string) {
  const endpointProcedure = getPerformanceProcedures(getRouterRecord(router)).find(
    ([candidate]) => candidate === path,
  )?.[1];
  if (!endpointProcedure) {
    throw new Error(`Unable to resolve procedure ${path}`);
  }
  return endpointProcedure;
}

function getRouterRecord(router: RouterWithProcedures): object {
  const procedures = Reflect.get(router._def, "procedures");
  if (procedures && typeof procedures === "object" && Object.keys(procedures).length > 0) {
    return procedures;
  }
  const record = Reflect.get(router._def, "record");
  return record && typeof record === "object" ? record : {};
}

function getPerformanceProcedures(record: object, prefix = ""): Array<[string, EndpointProcedure]> {
  return Object.entries(record).flatMap(([name, value]) => {
    const path = prefix ? `${prefix}.${name}` : name;
    const procedure = toEndpointProcedure(value);
    if (procedure) return [[path, procedure]];
    if (!value || (typeof value !== "object" && typeof value !== "function")) return [];
    const definition = Reflect.get(value, "_def");
    const nestedRecord =
      definition && typeof definition === "object" ? Reflect.get(definition, "record") : undefined;
    return nestedRecord && typeof nestedRecord === "object"
      ? getPerformanceProcedures(nestedRecord, path)
      : [];
  });
}

function toEndpointProcedure(value: unknown): EndpointProcedure | null {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return null;
  const definition = "_def" in value ? value._def : value;
  if (!definition || typeof definition !== "object" || !("type" in definition)) return null;
  if (
    definition.type !== "query" &&
    definition.type !== "mutation" &&
    definition.type !== "subscription"
  ) {
    return null;
  }
  return {
    type: definition.type,
    ...("inputs" in definition && Array.isArray(definition.inputs)
      ? { inputs: definition.inputs }
      : {}),
  };
}

export async function measureEndpointPerformance(
  runEndpoint: () => Promise<unknown>,
): Promise<EndpointPerformanceResult> {
  const startedAt = performance.now();

  try {
    await Promise.race([
      runEndpoint(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Endpoint exceeded ${ENDPOINT_PERFORMANCE_TIMEOUT_MS}ms timeout`)),
          ENDPOINT_PERFORMANCE_TIMEOUT_MS,
        ),
      ),
    ]);

    return {
      durationMs: performance.now() - startedAt,
      status: "fulfilled",
    };
  } catch (error) {
    const result = {
      durationMs: performance.now() - startedAt,
      status: "rejected" as const,
    };
    return error === undefined ? result : { ...result, error };
  }
}

export function getEndpointCaller(caller: unknown, path: string) {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || (typeof current !== "object" && typeof current !== "function")) {
      throw new Error(`Unable to resolve endpoint caller for ${path}`);
    }

    return (current as Record<string, unknown>)[segment];
  }, caller);
}

function getBudgetMs(path: string, type: EndpointPerformanceBudget["type"]) {
  if (path.includes("import") || path.includes("analyze") || path.includes("sync")) {
    return 1_000;
  }

  if (path.includes("trainingPlans") || path.includes("events.reconcile")) {
    return 750;
  }

  return type === "query" ? 250 : 500;
}

function createMockValue(schema: unknown, fieldName: string): unknown {
  const def = (schema as { _def?: Record<string, unknown> })?._def;
  if (!def) return mockString(fieldName, schema);

  const type = def?.type;

  switch (type) {
    case "any":
    case "unknown":
      return {};
    case "array":
      return [createMockValue(def.element, singularize(fieldName))];
    case "boolean":
      return true;
    case "date":
      return new Date("2026-04-01T12:00:00.000Z");
    case "default":
      return typeof def.defaultValue === "function" ? def.defaultValue() : def.defaultValue;
    case "enum": {
      const values = Object.values((schema as { enum?: Record<string, unknown> }).enum ?? {});
      return values[0];
    }
    case "literal": {
      const values = def.values as unknown[] | undefined;
      return values?.[0];
    }
    case "nullable":
    case "optional":
      return undefined;
    case "number":
      return mockNumber(fieldName, schema);
    case "object":
      return createMockObject(schema as { _def: { shape: Record<string, unknown> } });
    case "pipe":
      return createMockValue(def.in, fieldName);
    case "string":
      return mockString(fieldName, schema);
    case "union":
      return createMockValue((def.options as unknown[] | undefined)?.[0], fieldName);
    default:
      return mockString(fieldName, schema);
  }
}

function createMockObject(schema: { _def: { shape: Record<string, unknown> } }) {
  const shape = schema._def.shape;
  const input: Record<string, unknown> = {};

  for (const [fieldName, fieldSchema] of Object.entries(shape)) {
    const value = createMockValue(fieldSchema, fieldName);
    if (value !== undefined) {
      input[fieldName] = value;
    }
  }

  return input;
}

function mockNumber(fieldName: string, schema: unknown) {
  const numberSchema = schema as { maxValue?: number; minValue?: number };
  const minimum = numberSchema.minValue ?? 1;
  const maximum = numberSchema.maxValue ?? minimum;

  if (fieldName.includes("limit")) return Math.min(Math.max(minimum, 10), maximum);
  if (fieldName.includes("page")) return 1;
  if (fieldName.includes("percent")) return Math.min(Math.max(minimum, 50), maximum);

  return minimum;
}

function mockString(fieldName: string, schema: unknown) {
  const stringSchema = schema as { format?: string | null };

  if (stringSchema.format === "uuid" || fieldName === "id" || fieldName.endsWith("_id")) {
    return fieldName.includes("target") || fieldName.includes("other")
      ? OTHER_UUID_VALUE
      : UUID_VALUE;
  }

  if (stringSchema.format === "email" || fieldName.includes("email")) {
    return "athlete@example.com";
  }

  if (stringSchema.format === "url" || fieldName.includes("url")) {
    return "https://example.com/file.fit";
  }

  if (fieldName.includes("date")) return "2026-04-01";
  if (fieldName.includes("time") || fieldName.endsWith("_at")) return "2026-04-01T12:00:00.000Z";
  if (fieldName.includes("fileName")) return "avatar.jpg";
  if (fieldName.includes("filePath") || fieldName.includes("path"))
    return `${UUID_VALUE}/avatar.jpg`;
  if (fieldName.includes("mime") || fieldName.includes("type")) return "image/jpeg";
  if (fieldName.includes("provider")) return "strava";
  if (fieldName.includes("timezone")) return "UTC";
  if (fieldName.includes("username")) return "athlete";

  return "performance-test";
}

function singularize(value: string) {
  return value.endsWith("s") ? value.slice(0, -1) : value;
}
