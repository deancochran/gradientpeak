import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { Toaster } from "./index.web";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light" }),
}));

describe("Sonner web", () => {
  it("renders toasts through the shared toaster", async () => {
    renderWeb(<Toaster />);
    toast("Workout saved");

    expect(await screen.findByText("Workout saved")).toBeInTheDocument();
  });
});
