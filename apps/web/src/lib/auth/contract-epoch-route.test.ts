import { CONTRACT_EPOCH_HEADER, CURRENT_CONTRACT_EPOCH } from "@repo/api/contract-epoch";
import { describe, expect, it, vi } from "vitest";
import {
  authorizeAuthRouteContractEpoch,
  runWithAuthorizedAuthRouteContractEpoch,
} from "./contract-epoch-route";

const authUrl = (path: string) => `https://app.example.test/api/auth${path}`;

function appRequest(path: string, init: RequestInit = {}) {
  return new Request(authUrl(path), {
    ...init,
    headers: {
      [CONTRACT_EPOCH_HEADER]: String(CURRENT_CONTRACT_EPOCH),
      ...init.headers,
    },
  });
}

describe("Better Auth contract-epoch route guard", () => {
  it("accepts only the exact current epoch for first-party auth requests", () => {
    expect(authorizeAuthRouteContractEpoch(appRequest("/get-session"))).toBeNull();
    expect(
      authorizeAuthRouteContractEpoch(
        appRequest("/get-session", {
          headers: { [CONTRACT_EPOCH_HEADER]: `${CURRENT_CONTRACT_EPOCH}, 0` },
        }),
      ),
    ).toMatchObject({ status: 412 });
  });

  it.each([
    ["missing", new Request(authUrl("/get-session"))],
    [
      "mismatched",
      new Request(authUrl("/sign-in/email"), {
        method: "POST",
        headers: { [CONTRACT_EPOCH_HEADER]: "0" },
      }),
    ],
  ])("rejects %s epoch before get-session and auth mutation effects", (_name, request) => {
    expect(authorizeAuthRouteContractEpoch(request)).toMatchObject({ status: 412 });
  });

  it("does not run get-session or auth mutation effects until the request is gated", async () => {
    const getSession = vi.fn(() => "session");
    const mutateAuth = vi.fn(() => "mutated");

    await expect(
      runWithAuthorizedAuthRouteContractEpoch(new Request(authUrl("/get-session")), getSession),
    ).resolves.toMatchObject({ status: 412 });
    await expect(
      runWithAuthorizedAuthRouteContractEpoch(
        new Request(authUrl("/sign-in/email"), { method: "POST" }),
        mutateAuth,
      ),
    ).resolves.toMatchObject({ status: 412 });

    expect(getSession).not.toHaveBeenCalled();
    expect(mutateAuth).not.toHaveBeenCalled();
  });

  it("runs a first-party effect after an exact epoch match", async () => {
    const getSession = vi.fn(() => "session");

    await expect(
      runWithAuthorizedAuthRouteContractEpoch(appRequest("/get-session"), getSession),
    ).resolves.toBe("session");
    expect(getSession).toHaveBeenCalledOnce();
  });

  it.each([
    "/verify-email?token=signed-token",
    "/reset-password/signed-token?callbackURL=https%3A%2F%2Fapp.example.test%2Fauth%2Fconfirm",
    "/callback/configured-provider?code=provider-code&state=signed-state",
  ])("allows the necessary external signed GET path without an app header", (path) => {
    expect(authorizeAuthRouteContractEpoch(new Request(authUrl(path)))).toBeNull();
  });

  it.each([
    "/verify-email",
    "/reset-password",
    "/callback/configured-provider",
  ])("does not exempt non-GET %s requests", (path) => {
    expect(
      authorizeAuthRouteContractEpoch(new Request(authUrl(path), { method: "POST" })),
    ).toMatchObject({ status: 412 });
  });
});
