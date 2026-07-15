import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartCard, ChartEmptyState } from "./index.web";

describe("ChartCard", () => {
  it("exposes a textual summary and visible chart states", () => {
    render(
      <ChartCard
        legend={[{ color: "#000", id: "load", label: "Load" }]}
        summary={[{ label: "Latest", value: "72 kg" }]}
        title="Weight trend"
      >
        <ChartEmptyState message="No measurements" />
      </ChartCard>,
    );

    expect(screen.getByText("Weight trend. Latest: 72 kg")).toBeInTheDocument();
    expect(screen.getByLabelText("Chart legend")).toHaveTextContent("Load");
    expect(screen.getByText("No measurements")).toBeInTheDocument();
  });
});
