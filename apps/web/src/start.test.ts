import { describe, expect, it } from "vitest";

import { webCsrfMiddleware } from "./start";

describe("TanStack Start CSRF middleware", () => {
  it("is registered as the framework CSRF middleware", () => {
    expect(
      Object.getOwnPropertySymbols(webCsrfMiddleware).some((symbol) =>
        String(symbol).includes("csrf-middleware"),
      ),
    ).toBe(true);
  });
});
