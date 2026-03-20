import { fireEvent, render, screen } from "@testing-library/react";

export function renderWeb(ui: React.ReactElement) {
  return render(ui);
}

export { fireEvent, screen };
