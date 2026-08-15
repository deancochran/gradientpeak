// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "./$metricId";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  metric: undefined as unknown,
  update: vi.fn(),
}));
const submittedAt = "2026-08-02T12:00";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => vi.fn(),
    useParams: () => ({ metricId: "metric-1" }),
  }),
  Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
vi.mock("../../../components/protected/activity-route-primitives", () => ({
  DetailPageIntro: ({
    actions,
    description,
    title,
  }: {
    actions: React.ReactNode;
    description: string;
    title: string;
  }) => (
    <>
      <h1>{title}</h1>
      <p>{description}</p>
      {actions}
    </>
  ),
}));
vi.mock("../../../components/protected/profile-metric-form", () => ({
  getProfileMetricFormValues: () => ({ notes: "", recorded_at: "2026-08-01T12:00", value: 70 }),
  ProfileMetricForm: ({
    onSubmit,
  }: {
    onSubmit: (values: { notes?: string; recorded_at: string; value: number }) => void;
  }) => (
    <button
      onClick={() => onSubmit({ notes: "Updated note", recorded_at: submittedAt, value: 71 })}
      type="button"
    >
      Save metric form
    </button>
  ),
}));
vi.mock("../../../hooks/use-viewing-user-preferred-unit-system", () => ({
  useViewingUserPreferredUnitSystem: () => ({ unitSystem: "metric" }),
}));
vi.mock("../../../components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "athlete-1" } }),
}));
vi.mock("../../../lib/api/client", () => ({
  api: {
    profileMetrics: {
      getById: {
        useQuery: () => ({
          data: mocks.metric,
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        }),
      },
      update: { useMutation: () => ({ isPending: false, mutate: mocks.update }) },
      create: { useMutation: () => ({ isPending: false, mutate: mocks.create }) },
      delete: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
    useUtils: () => ({ profileMetrics: { invalidate: vi.fn(), getById: { invalidate: vi.fn() } } }),
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  mocks.update.mockReset();
  mocks.create.mockReset();
  mocks.metric = {
    id: "metric-1",
    metric_type: "weight_kg",
    value: 70,
    unit: "kg",
    recorded_at: "2026-08-01T12:00:00.000Z",
    source: "provider",
    notes: "Morning check-in",
    reference_activity_id: "activity-1",
  };
});
afterEach(cleanup);

describe("ProfileMetricDetailPage", () => {
  it("renders viewer-facing metric evidence, activity navigation, and a provider override", () => {
    const ProfileMetricDetailPage = (Route as unknown as { component: React.ComponentType })
      .component;
    render(<ProfileMetricDetailPage />);

    expect(screen.getByRole("heading", { name: "Weight" })).toBeTruthy();
    expect(screen.getByText("70 kg")).toBeTruthy();
    expect(screen.getAllByText("Provider")).toHaveLength(2);
    expect(screen.getByText("Morning check-in")).toBeTruthy();
    expect(screen.getByText("View reference activity").getAttribute("to")).toBe(
      "/activities/$activityId",
    );
    fireEvent.click(screen.getByRole("button", { name: "Manual override" }));
    expect(screen.getByRole("heading", { name: "Override Weight" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save metric form" }));
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith({
      metric_type: "weight_kg",
      notes: "Updated note",
      profile_id: "athlete-1",
      recorded_at: new Date(submittedAt).toISOString(),
      reference_activity_id: null,
      value: 71,
    });
  });

  it("offers edit and delete actions only for manual metrics", () => {
    mocks.metric = { ...(mocks.metric as object), source: "manual", reference_activity_id: null };
    const ProfileMetricDetailPage = (Route as unknown as { component: React.ComponentType })
      .component;
    render(<ProfileMetricDetailPage />);

    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Manual override" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save metric form" }));
    expect(mocks.update).toHaveBeenCalledWith({
      id: "metric-1",
      notes: "Updated note",
      recorded_at: new Date(submittedAt).toISOString(),
      value: 71,
    });
  });
});
