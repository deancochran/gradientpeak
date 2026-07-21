import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { AppHeader } from "../AppHeader";

jest.mock("../HeaderButtons", () => ({
  __esModule: true,
  MessagesHeaderButton: createHost("MessagesHeaderButton"),
  NotificationsHeaderButton: createHost("NotificationsHeaderButton"),
  SearchHeaderButton: createHost("SearchHeaderButton"),
}));

describe("AppHeader", () => {
  it("renders the caller-supplied destination title", () => {
    renderNative(<AppHeader title="Calendar" />);

    expect(screen.getByText("Calendar")).toBeTruthy();
    expect(screen.queryByText("GradientPeak")).toBeNull();
  });

  it("keeps the product title as a fallback", () => {
    renderNative(<AppHeader />);

    expect(screen.getByText("GradientPeak")).toBeTruthy();
  });
});
