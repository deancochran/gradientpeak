import { expect, it, vi } from "vitest";

const { createGradientPeakWebAuthClient, getSession, normalizeSession } = vi.hoisted(() => ({
  getSession: vi.fn(),
  normalizeSession: vi.fn(),
  createGradientPeakWebAuthClient: vi.fn(() => ({ getSession })),
}));

vi.mock("@repo/auth/client", () => ({
  normalizeGradientPeakAuthClientSession: normalizeSession,
  resolveGradientPeakAuthBaseUrl: vi.fn(() => "https://app.example.test/api/auth"),
}));
vi.mock("@repo/auth/client/web", () => ({ createGradientPeakWebAuthClient }));
vi.mock("@repo/api/contract-epoch", () => ({
  CONTRACT_EPOCH_HEADER: "x-gradientpeak-contract-epoch",
  CURRENT_CONTRACT_EPOCH: 1,
}));
vi.mock("../app-url", () => ({ getAppBaseUrl: () => "https://app.example.test" }));

import { getWebAuthSession, SessionUnavailableError } from "./client";

it("configures the web auth client to send the current contract epoch", () => {
  expect(createGradientPeakWebAuthClient).toHaveBeenCalledWith(
    expect.objectContaining({
      fixedHeaders: { "x-gradientpeak-contract-epoch": "1" },
    }),
  );
});

it("distinguishes a successful anonymous session from an unavailable session lookup", async () => {
  getSession.mockResolvedValueOnce({ data: null, error: null });
  normalizeSession.mockReturnValueOnce(null);
  await expect(getWebAuthSession()).resolves.toBeNull();

  getSession.mockResolvedValueOnce({ data: null, error: new TypeError("offline") });
  await expect(getWebAuthSession()).rejects.toBeInstanceOf(SessionUnavailableError);

  getSession.mockRejectedValueOnce(new TypeError("offline"));
  await expect(getWebAuthSession()).rejects.toBeInstanceOf(SessionUnavailableError);
});
