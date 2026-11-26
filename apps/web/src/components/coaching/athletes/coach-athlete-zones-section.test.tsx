// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type CoachAthleteZonesLoaderSnapshot,
  CoachAthleteZonesSection,
} from "./coach-athlete-zones-section";

let capturedRetry: (() => void) | undefined;

vi.mock("./coach-athlete-zones", () => ({
  CoachAthleteZonesCard: ({
    result,
    error,
    retryPending,
    onRetry,
  }: {
    result:
      | { status: "granted"; zones: { power: { source: { value: number | null } } } }
      | { status: "forbidden" }
      | null;
    error?: boolean;
    retryPending?: boolean;
    onRetry?: () => void;
  }) => {
    capturedRetry = onRetry;
    if (result?.status === "forbidden") return <p>denied</p>;
    if (result?.status === "granted") return <p>threshold {result.zones.power.source.value}</p>;
    if (retryPending) return <p>loading</p>;
    if (error)
      return (
        <button type="button" onClick={onRetry}>
          Retry bike zones
        </button>
      );
    return <p>empty</p>;
  },
}));

const base = (
  state: CoachAthleteZonesLoaderSnapshot["state"],
): CoachAthleteZonesLoaderSnapshot => ({
  actorId: "actor-a",
  organizationId: "11111111-1111-4111-8111-111111111111",
  athleteProfileId: "22222222-2222-4222-8222-222222222222",
  revision: "1",
  state,
});
const granted = (threshold: number) =>
  ({
    status: "granted",
    zones: {
      activityCategory: "bike",
      asOf: "2026-08-10T12:00:00.000Z",
      publication: { status: "available", publishedRevision: 1, computedAt: null },
      power: {
        source: {
          availability: "unavailable",
          value: threshold,
          unit: "watts",
          state: "unavailable",
          freshness: "unavailable",
          effectiveAt: null,
          policyVersion: null,
          method: null,
          calculationVersion: null,
          provenance: "unavailable",
        },
        zoneAvailability: "available",
        policyVersion: null,
        zones: null,
      },
      heartRate: {
        source: {
          availability: "unavailable",
          value: null,
          unit: "beats_per_minute",
          state: "unavailable",
          freshness: "unavailable",
          effectiveAt: null,
          policyVersion: null,
          method: null,
          calculationVersion: null,
          provenance: "unavailable",
        },
        zoneAvailability: "unavailable",
        policyVersion: null,
        zones: null,
      },
    },
  }) as never;

afterEach(() => {
  capturedRetry = undefined;
  cleanup();
});

describe("CoachAthleteZonesSection", () => {
  it("runs one load when the same retry callback is invoked twice synchronously", async () => {
    let resolve!: (value: ReturnType<typeof granted>) => void;
    const load = vi.fn(
      () =>
        new Promise<ReturnType<typeof granted>>((r) => {
          resolve = r;
        }),
    );
    render(
      <>
        <p>Calendar overview remains</p>
        <CoachAthleteZonesSection snapshot={base({ kind: "failed" })} loadZones={load as never} />
      </>,
    );
    const retry = capturedRetry;
    expect(retry).toBeTypeOf("function");
    act(() => {
      retry?.();
      retry?.();
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Calendar overview remains")).toBeTruthy();
    await act(async () => {
      resolve(granted(101));
    });
    expect(screen.getByText("threshold 101")).toBeTruthy();
  });

  it("poisons a denied fence immediately and only a new revision can recover", async () => {
    let resolve!: (value: ReturnType<typeof granted>) => void;
    const load = vi.fn(
      () =>
        new Promise<ReturnType<typeof granted>>((r) => {
          resolve = r;
        }),
    );
    const view = render(
      <CoachAthleteZonesSection snapshot={base({ kind: "failed" })} loadZones={load as never} />,
    );
    act(() => {
      capturedRetry?.();
    });
    view.rerender(
      <CoachAthleteZonesSection
        snapshot={{ ...base({ kind: "denied" }), revision: "1" }}
        loadZones={load as never}
      />,
    );
    expect(screen.getByText("denied")).toBeTruthy();
    await act(async () => {
      resolve(granted(101));
    });
    expect(screen.getByText("denied")).toBeTruthy();
    view.rerender(
      <CoachAthleteZonesSection snapshot={base({ kind: "failed" })} loadZones={load as never} />,
    );
    expect(screen.getByText("denied")).toBeTruthy();
    view.rerender(
      <CoachAthleteZonesSection
        snapshot={{ ...base({ kind: "failed" }), revision: "2" }}
        loadZones={load as never}
      />,
    );
    expect(screen.getByRole("button", { name: "Retry bike zones" })).toBeTruthy();
    act(() => {
      capturedRetry?.();
    });
    await act(async () => {
      resolve(granted(404));
    });
    expect(screen.getByText("threshold 404")).toBeTruthy();
  });

  it("allows B retry while A hangs and drops out-of-order A1 → B2 → A3 completions", async () => {
    const resolvers: Array<(value: ReturnType<typeof granted>) => void> = [];
    const load = vi.fn(
      () => new Promise<ReturnType<typeof granted>>((resolve) => resolvers.push(resolve)),
    );
    const view = render(
      <CoachAthleteZonesSection snapshot={base({ kind: "failed" })} loadZones={load as never} />,
    );
    act(() => {
      capturedRetry?.();
    });
    view.rerender(
      <CoachAthleteZonesSection
        snapshot={{
          ...base({ kind: "failed" }),
          athleteProfileId: "33333333-3333-4333-8333-333333333333",
          revision: "2",
        }}
        loadZones={load as never}
      />,
    );
    act(() => {
      capturedRetry?.();
    });
    view.rerender(
      <CoachAthleteZonesSection
        snapshot={{ ...base({ kind: "failed" }), revision: "3" }}
        loadZones={load as never}
      />,
    );
    act(() => {
      capturedRetry?.();
    });
    expect(load).toHaveBeenCalledTimes(3);
    await act(async () => {
      resolvers[1]?.(granted(202));
    });
    await act(async () => {
      resolvers[0]?.(granted(101));
    });
    await act(async () => {
      resolvers[2]?.(granted(303));
    });
    expect(screen.getByText("threshold 303")).toBeTruthy();
    expect(screen.queryByText("threshold 101")).toBeNull();
    expect(screen.queryByText("threshold 202")).toBeNull();
  });

  it("does not fetch initially in StrictMode and ignores rejected and granted settlement after unmount", async () => {
    const pending: Array<{
      resolve: (value: ReturnType<typeof granted>) => void;
      reject: (error: Error) => void;
    }> = [];
    const load = vi.fn(
      () =>
        new Promise<ReturnType<typeof granted>>((resolve, reject) => {
          pending.push({ resolve, reject });
        }),
    );
    const view = render(
      <StrictMode>
        <CoachAthleteZonesSection snapshot={base({ kind: "failed" })} loadZones={load as never} />
      </StrictMode>,
    );
    expect(load).not.toHaveBeenCalled();
    act(() => {
      capturedRetry?.();
    });
    view.unmount();
    await act(async () => {
      pending[0]?.reject(new Error("unmounted"));
    });
    expect(load).toHaveBeenCalledTimes(1);

    const second = render(
      <StrictMode>
        <CoachAthleteZonesSection snapshot={base({ kind: "failed" })} loadZones={load as never} />
      </StrictMode>,
    );
    expect(load).toHaveBeenCalledTimes(1);
    act(() => {
      capturedRetry?.();
    });
    second.unmount();
    await act(async () => {
      pending[1]?.resolve(granted(505));
    });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
