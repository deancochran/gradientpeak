import type React from "react";

type SettingsFormSubmitEvent = Pick<
  React.FormEvent<HTMLFormElement>,
  "currentTarget" | "preventDefault"
>;

export async function submitValidatedSettingsForm(
  event: SettingsFormSubmitEvent,
  validate: () => Promise<boolean>,
  onValidSubmit?: () => void,
) {
  event.preventDefault();
  const formElement = event.currentTarget;
  if (!(await validate())) return false;
  // Invoked after the draft is valid but before the native submit, so an
  // authoritative save can release the unsaved-changes guard exactly once.
  onValidSubmit?.();
  HTMLFormElement.prototype.submit.call(formElement);
  return true;
}
