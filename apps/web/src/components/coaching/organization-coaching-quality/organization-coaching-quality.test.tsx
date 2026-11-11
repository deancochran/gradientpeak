// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#test">{children}</a>,
  useRouter: () => ({ invalidate: vi.fn() }),
}));

import {
  OrganizationCoachingQuality,
  OrganizationCoachingQualityPending,
} from "./organization-coaching-quality";

const overview = {
  scopeKind: "assigned_engagements" as const,
  scopeExplanation: "Only current direct and group assignments.",
  snapshotAsOf: new Date("2026-01-01"),
  definitions: {
    version: "coaching-quality-overview.v1" as const,
    activeEngagements: "Active definition",
    pausedEngagements: "Paused definition",
    activeWithoutPrimary: "Primary definition",
    snapshotAsOf: "Observation timestamp definition",
  },
  aggregates: { activeEngagementCount: 2, pausedEngagementCount: 1, activeWithoutPrimaryCount: 1 },
};
describe("coaching assignment facts", () => {
  it("renders facts, scope, definitions, and unavailable distinctions without identities", () => {
    render(<OrganizationCoachingQuality organizationId="org" overview={overview} />);
    expect(screen.getByRole("heading", { name: "Coaching assignment facts" })).toBeTruthy();
    expect(screen.getByText("Scope")).toBeTruthy();
    expect(screen.getByText("Definitions")).toBeTruthy();
    expect(screen.getByText(/not a coaching-quality score/)).toBeTruthy();
    expect(screen.getByText(/Review workload/)).toBeTruthy();
  });
  it("renders a truthful empty state and pending shell", () => {
    const { rerender } = render(
      <OrganizationCoachingQuality
        organizationId="org"
        overview={{
          ...overview,
          aggregates: {
            activeEngagementCount: 0,
            pausedEngagementCount: 0,
            activeWithoutPrimaryCount: 0,
          },
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: /No coaching assignment facts/ })).toBeTruthy();
    rerender(<OrganizationCoachingQualityPending organizationId="org" />);
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
