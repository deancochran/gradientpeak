import { expect, it, vi } from "vitest";

const { createGradientPeakWebAuthClient } = vi.hoisted(() => ({
  createGradientPeakWebAuthClient: vi.fn(() => ({ getSession: vi.fn() })),
}));

vi.mock("@repo/auth/client", () => ({
  normalizeGradientPeakAuthClientSession: vi.fn(),
  resolveGradientPeakAuthBaseUrl: vi.fn(() => "https://app.example.test/api/auth"),
}));
vi.mock("@repo/auth/client/web", () => ({ createGradientPeakWebAuthClient }));
vi.mock("@repo/api/contract-epoch", () => ({
  CONTRACT_EPOCH_HEADER: "x-gradientpeak-contract-epoch",
  CURRENT_CONTRACT_EPOCH: 1,
}));
vi.mock("../app-url", () => ({ getAppBaseUrl: () => "https://app.example.test" }));

import "./client";

it("configures the web auth client to send the current contract epoch", () => {
  expect(createGradientPeakWebAuthClient).toHaveBeenCalledWith(
    expect.objectContaining({
      fixedHeaders: { "x-gradientpeak-contract-epoch": "1" },
    }),
  );
});
