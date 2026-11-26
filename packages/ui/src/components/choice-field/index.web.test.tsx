import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { useZodForm } from "../../hooks/use-zod-form";
import { useZodFormSubmit } from "../../hooks/use-zod-form-submit";
import { FormChoiceField } from "../form-fields/choice-field.web";
import { ChoiceField } from "./index.web";
import { resolveChoice, resolveNativeChoicePresentation } from "./shared";
import { useChoiceField } from "./use-choice-field";

const options = [
  { value: "easy", label: "Easy" },
  { value: "hard", label: "Hard" },
  { value: "retired", label: "Retired", disabled: true },
] as const;
afterEach(cleanup);
describe("ChoiceField web", () => {
  it("respects label width, font scale and explicit native presentation rather than count alone", () => {
    const pair = [
      { value: "time", label: "Time" },
      { value: "pace", label: "Pace" },
    ];
    expect(resolveNativeChoicePresentation({ options: pair }, 320, 1)).toBe("segmented");
    expect(resolveNativeChoicePresentation({ options: pair, presentation: "panel" }, 320, 1)).toBe(
      "list",
    );
    expect(
      resolveNativeChoicePresentation({ options: pair, nativePresentation: "menu" }, 320, 1),
    ).toBe("menu");
    expect(
      resolveNativeChoicePresentation({ options: pair, nativePresentation: "segmented" }, 120, 2),
    ).toBe("list");
    expect(
      resolveNativeChoicePresentation(
        {
          options: [
            { value: "one", label: "A deliberately long first option" },
            { value: "two", label: "Another long option" },
          ],
        },
        320,
        1,
      ),
    ).toBe("menu");
    expect(
      resolveNativeChoicePresentation(
        { options: Array.from({ length: 8 }, (_, value) => ({ value, label: String(value) })) },
        320,
        1,
      ),
    ).toBe("searchable");
  });
  it("keeps option descriptions accessible and returns numeric zero without coercion", () => {
    const change = vi.fn();
    render(
      <ChoiceField
        label="Priority"
        value={undefined}
        options={[
          { value: 0, label: "Lowest priority", description: "Keep this goal optional." },
          { value: 1, label: "Higher priority" },
        ]}
        onChange={change}
      />,
    );
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    const option = screen.getByRole("option", { name: "Lowest priority" });
    expect(option).toHaveAccessibleDescription("Keep this goal optional.");
    fireEvent.click(option);
    expect(change).toHaveBeenCalledWith(0);
  });
  it("distinguishes missing, unknown and disabled options without choosing the first", () => {
    const change = vi.fn();
    const view = render(
      <ChoiceField label="Effort" value={undefined} options={options} onChange={change} />,
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("Choose");
    expect(resolveChoice(undefined, options).status).toBe("empty");
    expect(resolveChoice("other", options).status).toBe("invalid");
    view.rerender(
      <ChoiceField label="Effort" value="retired" options={options} onChange={change} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("unavailable");
    expect(screen.getByRole("combobox")).toHaveTextContent("Retired (unavailable)");
    expect(change).not.toHaveBeenCalled();
  });
  it("uses explicit clearing and rejects unknown/expired callbacks", () => {
    const change = vi.fn();
    const clear = vi.fn();
    const { result, rerender, unmount } = renderHook(
      ({ disabled, current }) =>
        useChoiceField(
          {
            label: "Effort",
            value: "easy",
            options,
            onChange: change,
            onClear: clear,
            disabled,
            isCurrent: () => current,
          },
          () => {},
        ),
      { initialProps: { disabled: false, current: true } },
    );
    const stale = result.current.select;
    stale("unknown");
    stale("retired");
    expect(change).not.toHaveBeenCalled();
    rerender({ disabled: true, current: true });
    stale("hard");
    rerender({ disabled: false, current: true });
    stale("hard");
    expect(change).not.toHaveBeenCalled();
    result.current.select("hard");
    expect(change).toHaveBeenCalledWith("hard");
    result.current.clear();
    expect(clear).toHaveBeenCalledTimes(1);
    const closed = result.current.select;
    rerender({ disabled: false, current: false });
    closed("easy");
    rerender({ disabled: false, current: true });
    closed("easy");
    unmount();
    closed("easy");
    expect(change).toHaveBeenCalledTimes(1);
  });
  it("blocks a permissive form on an unavailable value, focuses it, and resets with explicit null clearing", async () => {
    const submit = vi.fn();
    function Harness() {
      const form = useZodForm({
        schema: z.object({ effort: z.string().nullable() }),
        defaultValues: { effort: "legacy" },
      });
      const action = useZodFormSubmit({ form, onSubmit: submit });
      return (
        <form onSubmit={action.handleSubmit}>
          <FormChoiceField
            control={form.control}
            name="effort"
            label="Effort"
            options={options}
            clearable
            emptyValue={null}
          />
          <button type="submit">Save</button>
          <button type="button" onClick={() => form.reset({ effort: "hard" })}>
            Reset
          </button>
        </form>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByText("Save"));
    expect(screen.getByRole("combobox")).toHaveFocus();
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Reset"));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear Effort" }));
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ effort: null }));
  });
});
