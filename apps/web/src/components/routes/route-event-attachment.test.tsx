// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteEventAttachment } from "./route-event-attachment";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("../../lib/api/client", () => ({
  api: {
    useUtils: () => ({ events: { invalidate: vi.fn() } }),
    events: {
      list: {
        useQuery: () => ({
          data: {
            items: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                title: "Sunday long run",
                starts_at: "2026-07-26T08:00:00.000Z",
                scheduled_date: "2026-07-26",
              },
            ],
          },
          isError: false,
          isLoading: false,
        }),
      },
      update: {
        useMutation: () => ({ isPending: false, mutate }),
      },
    },
  },
}));

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

describe("RouteEventAttachment", () => {
  it("attaches the route to the selected event with single-occurrence scope", () => {
    render(<RouteEventAttachment routeId="22222222-2222-4222-8222-222222222222" />);

    fireEvent.change(screen.getByRole("combobox", { name: "Event" }), {
      target: { value: "11111111-1111-4111-8111-111111111111" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Attach route" }));

    expect(mutate).toHaveBeenCalledWith({
      id: "11111111-1111-4111-8111-111111111111",
      patch: { route_id: "22222222-2222-4222-8222-222222222222" },
      scope: "single",
    });
  });
});
