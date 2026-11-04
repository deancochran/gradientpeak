// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  captureOrganizationInvitationHandoff,
  initializeBrowserInstrumentation,
  takeOrganizationInvitationHandoff,
} from "./invitation-handoff";

const token = "a".repeat(43);

describe("organization invitation handoff", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });
  it("stores a valid fragment, removes it synchronously, and consumes it once", () => {
    window.history.replaceState(null, "", `/organization-invitation#invitation=${token}`);
    expect(captureOrganizationInvitationHandoff(window, 100)).toBe("stored");
    expect(window.location.hash).toBe("");
    expect(takeOrganizationInvitationHandoff(window.sessionStorage, 101)).toBe(token);
    expect(takeOrganizationInvitationHandoff(window.sessionStorage, 101)).toBeNull();
  });

  it("scrubs malformed, duplicate, and oversized fragments without storing them", () => {
    for (const fragment of [
      "#invitation=invalid",
      `#invitation=${token}&invitation=${token}`,
      `#invitation=${"a".repeat(257)}`,
    ]) {
      window.history.replaceState(null, "", `/organization-invitation${fragment}`);
      expect(captureOrganizationInvitationHandoff(window)).toBe("invalid");
      expect(window.location.hash).toBe("");
      expect(takeOrganizationInvitationHandoff(window.sessionStorage)).toBeNull();
    }
  });

  it("clears a previous handoff before rejecting a replacement fragment", () => {
    window.sessionStorage.setItem(
      "gradientpeak:organization-invitation:v1",
      JSON.stringify({ expiresAt: Date.now() + 1_000, token }),
    );
    window.history.replaceState(null, "", "/organization-invitation#invitation=invalid");
    expect(captureOrganizationInvitationHandoff(window)).toBe("invalid");
    expect(takeOrganizationInvitationHandoff(window.sessionStorage)).toBeNull();
  });

  it("rejects corrupt and expired stored values after removing them", () => {
    window.sessionStorage.setItem("gradientpeak:organization-invitation:v1", "not-json");
    expect(takeOrganizationInvitationHandoff(window.sessionStorage)).toBeNull();
    window.sessionStorage.setItem(
      "gradientpeak:organization-invitation:v1",
      JSON.stringify({ expiresAt: 1, token }),
    );
    expect(takeOrganizationInvitationHandoff(window.sessionStorage, 2)).toBeNull();
  });

  it.each(["getItem", "removeItem"] as const)("fails closed when storage %s throws", (method) => {
    const storage = {
      getItem: () => null,
      removeItem: () => undefined,
    } as unknown as Storage;
    Object.defineProperty(storage, method, {
      value: () => {
        throw new Error("blocked");
      },
    });
    expect(takeOrganizationInvitationHandoff(storage)).toBeNull();
  });

  it("fails closed when the sessionStorage getter throws", () => {
    const blockedWindow = {} as Window;
    Object.defineProperty(blockedWindow, "location", {
      value: { hash: `#invitation=${token}`, pathname: "/organization-invitation", search: "" },
    });
    Object.defineProperty(blockedWindow, "history", {
      value: { replaceState: () => undefined, state: null },
    });
    Object.defineProperty(blockedWindow, "sessionStorage", {
      get: () => {
        throw new Error("blocked");
      },
    });
    expect(captureOrganizationInvitationHandoff(blockedWindow)).toBe("storage_blocked");
  });

  it.each([
    "setItem",
    "removeItem",
  ] as const)("scrubs the URL even when capture storage %s throws", (method) => {
    window.history.replaceState(null, "", `/organization-invitation#invitation=${token}`);
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(captureOrganizationInvitationHandoff(window)).toBe("storage_blocked");
    expect(window.location.hash).toBe("");
  });

  it("instrumentation observes only the scrubbed URL, even with blocked persistence", () => {
    window.history.replaceState(null, "", `/organization-invitation#invitation=${token}`);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const observed: string[] = [];
    initializeBrowserInstrumentation(
      () => {
        captureOrganizationInvitationHandoff(window);
      },
      () => {
        observed.push(window.location.href);
      },
    );
    expect(observed).toHaveLength(1);
    expect(new URL(observed[0]!).hash).toBe("");
    expect(observed[0]).not.toContain(token);
  });
});
