import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrainingStateLegend } from "./index.web";

describe("TrainingStateLegend", () => {
  it("announces stable metric identities and recorded/projected source labels", () => {
    render(<TrainingStateLegend sources={["recorded", "projected"]} />);

    expect(screen.getByLabelText("Training-state legend")).toHaveTextContent(
      "FitnessFatigueForm━ Recorded━ Projected",
    );
  });
});
