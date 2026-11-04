import { describe, expect, it } from "vitest";
import {
  extractSafeErrorDiagnostic,
  sanitizeTelemetryContext,
  TELEMETRY_LIMITS,
} from "./telemetry-sanitizer.mjs";

describe("telemetry sanitizer", () => {
  it("bounds entries and retains only explicitly approved finite values", () => {
    const context = Object.fromEntries(
      Array.from({ length: TELEMETRY_LIMITS.maxEntries + 5 }, (_, index) => [
        `unknown_${index}`,
        "person@example.test",
      ]),
    );
    context.procedure_group = "groups";
    context.procedure_type = "mutation";
    context.outcome = "success";

    expect(sanitizeTelemetryContext(context)).toEqual({});
    expect(
      sanitizeTelemetryContext({
        procedure_group: "groups",
        procedure_type: "mutation",
        outcome: "success",
      }),
    ).toEqual({ procedure_group: "groups", procedure_type: "mutation", outcome: "success" });
  });

  it("preserves the bounded unsupported-activity outcome used by provider imports", () => {
    expect(sanitizeTelemetryContext({ outcome: "unsupported_activity_file" })).toEqual({
      outcome: "unsupported_activity_file",
    });
  });

  it("recognizes a traversed SQLSTATE without retaining SQL, parameters, identifiers, or health data", () => {
    const cause = Object.assign(
      new Error("column profile_email is missing from SELECT * WHERE id = $1"),
      {
        code: "42703",
        params: ["550e8400-e29b-41d4-a716-446655440000"],
        token: "Bearer synthetic-secret",
        health: { heartRate: 170 },
      },
    );
    const error = new Error("request failed", { cause });
    const diagnostic = extractSafeErrorDiagnostic(error);
    const serialized = JSON.stringify(diagnostic);

    expect(diagnostic).toMatchObject({
      diagnostic_category: "database",
      diagnostic_reason: "missing_column",
      postgres_code: "42703",
      safe_summary: "Database schema is missing a column.",
    });
    expect(serialized).not.toMatch(/SELECT|profile_email|\$1|550e8400|secret|heartRate|170/);
  });

  it("classifies SQLSTATE 42P01 without retaining relation or query text", () => {
    const error = Object.assign(
      new Error(
        'relation "private_provider_jobs" does not exist: SELECT * FROM private_provider_jobs',
      ),
      { code: "42P01" },
    );
    const diagnostic = extractSafeErrorDiagnostic(error);

    expect(diagnostic).toMatchObject({
      diagnostic_category: "database",
      diagnostic_reason: "missing_table",
      postgres_code: "42P01",
      safe_summary: "Database schema is missing a table.",
    });
    expect(JSON.stringify(diagnostic)).not.toMatch(/private_provider_jobs|SELECT/);
  });

  it("uses a neutral summary for validation errors without retaining issue values", () => {
    const error = Object.assign(new Error("private validation value"), { name: "ZodError" });
    const diagnostic = extractSafeErrorDiagnostic(error);

    expect(diagnostic).toMatchObject({
      diagnostic_category: "validation",
      diagnostic_reason: "validation_failure",
      safe_summary: "Data validation failed.",
    });
    expect(JSON.stringify(diagnostic)).not.toContain("private validation value");
  });

  it("allows the finite diagnostic context while denying raw payload fields", () => {
    expect(
      sanitizeTelemetryContext({
        procedure: "activities.create",
        diagnostic_category: "database",
        diagnostic_reason: "missing_column",
        safe_summary: "Database schema is missing a column.",
        sql: "SELECT * FROM activities WHERE id = $1",
        params: ["private"],
        body: { health: { heartRate: 170 } },
        token: "secret",
      }),
    ).toEqual({
      procedure: "activities.create",
      diagnostic_category: "database",
      diagnostic_reason: "missing_column",
      safe_summary: "Database schema is missing a column.",
    });
  });
});
