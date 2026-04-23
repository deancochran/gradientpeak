import { describe, expect, it } from "vitest";

import { SYSTEM_ROUTE_TEMPLATES } from "../system-routes";

describe("SYSTEM_ROUTE_TEMPLATES", () => {
  it("uses unique deterministic ids", () => {
    expect(new Set(SYSTEM_ROUTE_TEMPLATES.map((route) => route.id)).size).toBe(
      SYSTEM_ROUTE_TEMPLATES.length,
    );
  });

  it("only includes verified route-capable activity categories", () => {
    expect(new Set(SYSTEM_ROUTE_TEMPLATES.map((route) => route.activity_category))).toEqual(
      new Set(["run", "bike", "other"]),
    );
  });

  it("uses https download URLs for every template", () => {
    for (const route of SYSTEM_ROUTE_TEMPLATES) {
      expect(route.source_download_url.startsWith("https://")).toBe(true);
      expect(route.source_page_url.startsWith("https://")).toBe(true);
    }
  });
});
