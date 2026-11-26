import { describe, expect, it } from "vitest";
import { getWahooSyncRequestTimeoutMs } from "../../scripts/wahoo-sync-config.mjs";

describe("Wahoo sync scheduler config", () => {
  it("uses the runtime default and bounds scheduler request timeout", () => {
    expect(getWahooSyncRequestTimeoutMs({})).toBe(8000);
    expect(getWahooSyncRequestTimeoutMs({ WAHOO_PROVIDER_SYNC_REQUEST_TIMEOUT_MS: "12000" })).toBe(
      9000,
    );
    expect(
      getWahooSyncRequestTimeoutMs({ WAHOO_PROVIDER_SYNC_REQUEST_TIMEOUT_MS: "invalid" }),
    ).toBe(8000);
  });
});
