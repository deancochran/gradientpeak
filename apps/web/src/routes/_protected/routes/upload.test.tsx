// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Route } from "./upload";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), upload: vi.fn(), invalidate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ ...options, useNavigate: () => mocks.navigate }),
  useBlocker: vi.fn(),
}));
vi.mock("../../../components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "11111111-1111-4111-8111-111111111111" } }),
}));
vi.mock("../../../lib/api/client", () => ({
  api: {
    useUtils: () => ({ routes: { invalidate: mocks.invalidate } }),
    routes: { upload: { useMutation: () => ({ mutateAsync: mocks.upload }) } },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

it("opens the committed saved route after rejected navigation without another upload", async () => {
  const id = "22222222-2222-4222-8222-222222222222";
  mocks.upload.mockResolvedValue({ id });
  mocks.invalidate.mockRejectedValue(new Error("Cache unavailable"));
  mocks.navigate
    .mockRejectedValueOnce(new Error("Navigation unavailable"))
    .mockResolvedValueOnce(undefined);
  const Page = (Route as unknown as { component: React.ComponentType }).component;
  render(<Page />);
  const file = new File(["<gpx />"], "fixture.gpx", { type: "application/gpx+xml" });
  const read = vi.fn().mockResolvedValue("<gpx />");
  Object.defineProperty(file, "text", { value: read });
  fireEvent.change(screen.getByLabelText("GPX or TCX file"), { target: { files: [file] } });
  fireEvent.submit(screen.getByTestId("route-upload-form"));
  expect((await screen.findByRole("alert")).textContent).toContain("Route saved");
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/routes/$routeId", params: { routeId: id } });
  fireEvent.submit(screen.getByTestId("route-upload-form"));
  fireEvent.click(screen.getByRole("button", { name: "Open route" }));
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(2));
  expect(mocks.navigate.mock.calls[1]?.[0]).toEqual(mocks.navigate.mock.calls[0]?.[0]);
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledTimes(1);
});
