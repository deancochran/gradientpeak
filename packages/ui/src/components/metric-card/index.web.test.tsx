import { ActivityIcon } from "lucide-react";
import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { metricCardFixtures } from "./fixtures";
import { MetricCard } from "./index.web";

describe("MetricCard web", () => {
  it("renders comparison fixture content", () => {
    renderWeb(<MetricCard {...metricCardFixtures.distance} icon={ActivityIcon} />);

    expect(screen.getByText(metricCardFixtures.distance.label)).toBeInTheDocument();
    expect(screen.getByText(metricCardFixtures.distance.value)).toBeInTheDocument();
    expect(screen.getByText(metricCardFixtures.distance.comparisonValue!)).toBeInTheDocument();
  });
});
