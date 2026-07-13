import { describe, expect, it } from "vitest";
import { getProviderSyncRequestTimeoutMs } from "../../scripts/provider-sync-config.mjs";

describe("provider sync scheduler config", () => {
  it("uses the runtime default and bounds scheduler request timeout", () => {
    expect(getProviderSyncRequestTimeoutMs({})).toBe(8000);
    expect(
      getProviderSyncRequestTimeoutMs({ WAHOO_PROVIDER_SYNC_REQUEST_TIMEOUT_MS: "12000" }),
    ).toBe(9000);
    expect(
      getProviderSyncRequestTimeoutMs({ WAHOO_PROVIDER_SYNC_REQUEST_TIMEOUT_MS: "invalid" }),
    ).toBe(8000);
  });
});
