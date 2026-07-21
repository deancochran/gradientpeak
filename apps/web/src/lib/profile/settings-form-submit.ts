import type React from "react";

type SettingsFormSubmitEvent = Pick<
  React.FormEvent<HTMLFormElement>,
  "currentTarget" | "preventDefault"
>;

export async function submitValidatedSettingsForm(
  event: SettingsFormSubmitEvent,
  validate: () => Promise<boolean>,
) {
  event.preventDefault();
  const formElement = event.currentTarget;
  if (!(await validate())) return false;
  HTMLFormElement.prototype.submit.call(formElement);
  return true;
}
