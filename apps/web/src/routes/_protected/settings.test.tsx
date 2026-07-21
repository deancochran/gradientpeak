import { describe, expect, it, vi } from "vitest";

import { submitValidatedSettingsForm } from "./settings";

describe("settings profile submission", () => {
  it("captures the form before async validation releases the React event", async () => {
    const form = document.createElement("form");
    let currentTarget: HTMLFormElement | null = form;
    const preventDefault = vi.fn();
    const submit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});
    let finishValidation: ((value: boolean) => void) | undefined;
    const validation = new Promise<boolean>((resolve) => {
      finishValidation = resolve;
    });
    const event = {
      preventDefault,
      get currentTarget() {
        return currentTarget;
      },
    } as React.FormEvent<HTMLFormElement>;

    const pending = submitValidatedSettingsForm(event, () => validation);
    currentTarget = null;
    finishValidation?.(true);

    await expect(pending).resolves.toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledOnce();
    expect(submit.mock.instances[0]).toBe(form);
    submit.mockRestore();
  });
});
