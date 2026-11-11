import { describe, expect, it } from "vitest";
import { evaluateNotificationPolicy, type QuietHours } from "../policy";

const input = (overrides: Record<string, unknown> = {}) => ({
  capabilities: { email: "ready", push: "ready" },
  category: "plan_update",
  channel: "push",
  consents: [{ category: "plan_update", channel: "push", granted: true }],
  instant: "2026-11-06T20:00:00.000Z",
  isSensitive: false,
  timeZone: "America/New_York",
  ...overrides,
});

describe("notification policy", () => {
  it("requires exact channel and category consent", () => {
    expect(evaluateNotificationPolicy(input({ consents: [] }))).toEqual({
      kind: "deny",
      preview: "full",
      reason: "consent-unavailable",
    });
    expect(
      evaluateNotificationPolicy(
        input({ consents: [{ category: "plan_update", channel: "push", granted: false }] }),
      ),
    ).toEqual({ kind: "deny", preview: "full", reason: "consent-denied" });
  });

  it("does not turn a device permission-off result into a prompt loop", () => {
    expect(
      evaluateNotificationPolicy(
        input({ capabilities: { email: "ready", push: "permission-off" } }),
      ),
    ).toEqual({
      kind: "unavailable",
      preview: "full",
      reason: "push-permission-off",
    });
  });

  it("redacts sensitive previews unless the user explicitly permits them", () => {
    expect(evaluateNotificationPolicy(input({ isSensitive: true }))).toEqual({
      kind: "allow",
      preview: "redacted",
    });
    expect(
      evaluateNotificationPolicy(
        input({ isSensitive: true, previewPreference: "allow-sensitive" }),
      ),
    ).toEqual({
      kind: "allow",
      preview: "full",
    });
  });

  it("treats start as inclusive and end as exclusive in local quiet hours", () => {
    const quietHours: QuietHours = { days: ["friday"], start: "21:00", end: "23:00" };
    expect(
      evaluateNotificationPolicy(
        input({
          instant: "2026-11-07T02:00:00.000Z",
          quietHours,
        }),
      ),
    ).toMatchObject({ kind: "deny", reason: "quiet-hours" });
    expect(
      evaluateNotificationPolicy(
        input({
          instant: "2026-11-07T04:00:00.000Z",
          quietHours,
        }),
      ),
    ).toMatchObject({ kind: "allow" });
  });

  it("assigns an overnight post-midnight interval to its starting weekday", () => {
    const quietHours: QuietHours = { days: ["friday"], start: "22:00", end: "07:00" };
    expect(
      evaluateNotificationPolicy(
        input({
          instant: "2026-11-07T04:00:00.000Z",
          quietHours,
        }),
      ),
    ).toMatchObject({ kind: "deny", reason: "quiet-hours" });
    expect(
      evaluateNotificationPolicy(
        input({
          instant: "2026-11-07T12:00:00.000Z",
          quietHours,
        }),
      ),
    ).toMatchObject({ kind: "allow" });
  });

  it("evaluates actual instants across a daylight-saving transition without scheduling a next delivery", () => {
    const quietHours: QuietHours = { days: ["sunday"], start: "01:00", end: "03:00" };
    expect(
      evaluateNotificationPolicy(
        input({
          instant: "2026-03-08T06:59:00.000Z",
          quietHours,
        }),
      ),
    ).toMatchObject({ kind: "deny", reason: "quiet-hours" });
    expect(
      evaluateNotificationPolicy(
        input({
          instant: "2026-03-08T07:00:00.000Z",
          quietHours,
        }),
      ),
    ).toMatchObject({ kind: "allow" });
  });

  it("bounds consent input to the six possible channel-category pairs", () => {
    const consent = { category: "plan_update", channel: "push", granted: true };
    expect(
      evaluateNotificationPolicy(input({ consents: Array.from({ length: 7 }, () => consent) })),
    ).toEqual({
      kind: "unavailable",
      preview: "redacted",
      reason: "invalid-input",
    });
    expect(
      evaluateNotificationPolicy(
        input({ consents: Array.from({ length: 10_000 }, () => consent) }),
      ),
    ).toEqual({
      kind: "unavailable",
      preview: "redacted",
      reason: "invalid-input",
    });
  });

  it("fails closed when required time, timezone, consent, or capabilities are missing or invalid", () => {
    expect(evaluateNotificationPolicy({ ...input(), timeZone: "" })).toEqual({
      kind: "unavailable",
      preview: "redacted",
      reason: "invalid-input",
    });
    expect(evaluateNotificationPolicy(input({ instant: "2026-11-06T20:00" }))).toEqual({
      kind: "unavailable",
      preview: "redacted",
      reason: "invalid-input",
    });
    const { capabilities: _capabilities, ...withoutCapabilities } = input();
    expect(evaluateNotificationPolicy(withoutCapabilities)).toEqual({
      kind: "unavailable",
      preview: "redacted",
      reason: "invalid-input",
    });
    const { consents: _consents, ...withoutConsents } = input();
    expect(evaluateNotificationPolicy(withoutConsents)).toEqual({
      kind: "unavailable",
      preview: "redacted",
      reason: "invalid-input",
    });
  });
});
