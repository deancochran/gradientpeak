import { describe, expect, it } from "vitest";
import { sanitizeTelemetryContext, TELEMETRY_LIMITS } from "./telemetry-sanitizer.mjs";

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
});
