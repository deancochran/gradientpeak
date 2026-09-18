import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withLocalE2EDatabase: vi.fn(),
}));

vi.mock("../../e2e/support/database", () => mocks);

import { cleanupOwnedActivityPlans, cleanupOwnedGroups } from "../../e2e/utils/testData";

describe("web E2E cleanup identities", () => {
  it("requires at least one exact group name", async () => {
    await expect(cleanupOwnedGroups([])).rejects.toThrow(/named group identity/);
    expect(mocks.withLocalE2EDatabase).not.toHaveBeenCalled();
  });

  it("requires at least one exact activity-plan name", async () => {
    await expect(cleanupOwnedActivityPlans({ planNames: [] })).rejects.toThrow(
      /named activity plan identity/,
    );
    expect(mocks.withLocalE2EDatabase).not.toHaveBeenCalled();
  });
});
