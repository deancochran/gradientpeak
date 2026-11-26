import { afterEach, describe, expect, it, vi } from "vitest";

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("passes context through the telemetry sanitizer without changing code-authored messages", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { logger } = await import("./logger");

    logger.info("api.operation.completed", {
      procedure_group: "activities",
      outcome: "success",
      email: "person@example.test",
      payload: { token: "synthetic-secret" },
    });

    expect(info).toHaveBeenCalledWith("api.operation.completed", {
      procedure_group: "activities",
      outcome: "success",
    });
  });

  it("bounds code-authored log messages", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { logger } = await import("./logger");

    logger.info("x".repeat(200));

    expect(info).toHaveBeenCalledWith("x".repeat(160));
  });
});
