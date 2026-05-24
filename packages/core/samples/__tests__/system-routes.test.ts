import { describe, expect, it } from "vitest";

import { SYSTEM_ROUTE_TEMPLATES } from "../system-routes";

describe("SYSTEM_ROUTE_TEMPLATES", () => {
  it("uses unique deterministic ids", () => {
    expect(new Set(SYSTEM_ROUTE_TEMPLATES.map((route) => route.id)).size).toBe(
      SYSTEM_ROUTE_TEMPLATES.length,
    );
  });
});
