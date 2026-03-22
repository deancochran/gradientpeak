import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { textareaFixtures } from "./fixtures";
import { Textarea } from "./index.web";

describe("Textarea web", () => {
  it("maps normalized test props onto the DOM textarea", () => {
    renderWeb(<Textarea {...textareaFixtures.notes} readOnly value={textareaFixtures.value} />);

    const textarea = screen.getByRole("textbox", {
      name: textareaFixtures.notes.accessibilityLabel,
    });

    expect(textarea).toHaveAttribute("data-testid", textareaFixtures.notes.testId);
    expect(textarea).toHaveAttribute("id", textareaFixtures.notes.id);
    expect(textarea).toHaveValue(textareaFixtures.value);
  });
});
