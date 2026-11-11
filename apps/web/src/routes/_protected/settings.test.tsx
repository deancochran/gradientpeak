// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { submitValidatedSettingsForm } from "../../lib/profile/settings-form-submit";

describe("settings profile submission", () => {
  it("captures the form before async validation releases the React event", async () => {
    const form = document.createElement("form");
    const preventDefault = vi.fn();
    const submit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});
    let finishValidation: ((value: boolean) => void) | undefined;
    const validation = new Promise<boolean>((resolve) => {
      finishValidation = resolve;
    });
    const event = {
      preventDefault,
      currentTarget: form,
    };

    const pending = submitValidatedSettingsForm(event, () => validation);
    Object.defineProperty(event, "currentTarget", { value: null });
    finishValidation?.(true);

    await expect(pending).resolves.toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledOnce();
    expect(submit.mock.instances[0]).toBe(form);
    submit.mockRestore();
  });

  it("invokes the authoritative-save callback only after validation passes", async () => {
    const form = document.createElement("form");
    const submit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});
    const onValidSubmit = vi.fn();
    const event = {
      preventDefault: vi.fn(),
      currentTarget: form,
    };

    await submitValidatedSettingsForm(event, () => Promise.resolve(false), onValidSubmit);

    expect(onValidSubmit).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();

    await submitValidatedSettingsForm(event, () => Promise.resolve(true), onValidSubmit);

    expect(onValidSubmit).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledOnce();
    submit.mockRestore();
  });
});
