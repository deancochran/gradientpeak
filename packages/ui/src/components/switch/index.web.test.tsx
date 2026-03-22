import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderWeb, screen } from "../../test/render-web";
import { switchFixtures } from "./fixtures";
import { Switch } from "./index.web";

describe("Switch web", () => {
  it("maps normalized test props and toggles checked state", () => {
    const onCheckedChange = vi.fn();

    renderWeb(
      <Switch {...switchFixtures.notifications} checked={true} onCheckedChange={onCheckedChange} />,
    );

    const control = screen.getByRole("switch", {
      name: switchFixtures.notifications.accessibilityLabel,
    });

    expect(control).toHaveAttribute("data-testid", switchFixtures.notifications.testId);
    expect(control).toHaveAttribute("id", switchFixtures.notifications.id);

    fireEvent.click(control);

    expect(onCheckedChange).toHaveBeenCalled();
  });
});
