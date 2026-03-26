import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { labelFixtures } from "./fixtures";
import { Label } from "./index.web";

describe("Label web", () => {
  it("maps normalized test props and links to the target field", () => {
    renderWeb(
      <div>
        <Label htmlFor={labelFixtures.email.htmlFor} testId={labelFixtures.email.testId}>
          {labelFixtures.email.children}
        </Label>
        <input id={labelFixtures.email.htmlFor} />
      </div>,
    );

    expect(screen.getByTestId(labelFixtures.email.testId)).toHaveAttribute(
      "for",
      labelFixtures.email.htmlFor,
    );
    expect(screen.getByLabelText(labelFixtures.email.children)).toHaveAttribute(
      "id",
      labelFixtures.email.htmlFor,
    );
  });
});
