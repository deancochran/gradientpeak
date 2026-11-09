import { describe, expect, it } from "vitest";

import { contractEpochFunctionMiddleware } from "./lib/contract-epoch-middleware";
import { startInstance, webCsrfMiddleware } from "./start";

describe("TanStack Start CSRF middleware", () => {
  it("is registered as the framework CSRF middleware", () => {
    expect(
      Object.getOwnPropertySymbols(webCsrfMiddleware).some((symbol) =>
        String(symbol).includes("csrf-middleware"),
      ),
    ).toBe(true);
  });

  it("registers the contract epoch middleware globally after Sentry", async () => {
    const options = await startInstance.getOptions();

    expect(options.functionMiddleware).toContain(contractEpochFunctionMiddleware);
    expect(options.functionMiddleware?.at(-1)).toBe(contractEpochFunctionMiddleware);
  });
});
