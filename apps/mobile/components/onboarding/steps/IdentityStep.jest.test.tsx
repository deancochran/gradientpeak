import { act, fireEvent, render } from "@testing-library/react-native";

jest.mock("@/components/athlete-baseline", () => ({ AthleteBaselineFields: () => null }));
jest.mock("@/components/goals", () => ({ GoalEditorForm: () => null }));
jest.mock("./GroupsAndPeopleStep", () => ({ GroupsAndPeopleStep: () => null }));

import { IdentityStep } from ".";

const data = (full_name: string, username: string, planning_timezone = "America/New_York") =>
  ({ full_name, username, planning_timezone }) as Parameters<typeof IdentityStep>[0]["data"];

describe("IdentityStep parent synchronization", () => {
  it("publishes only changed fields and retains an edited timezone on background refresh", async () => {
    const updateData = jest.fn();
    const rendered = await render(
      <IdentityStep
        accountIdentity="account-a"
        data={data("Server name", "server_name")}
        updateData={updateData}
      />,
    );
    await fireEvent.changeText(rendered.getByTestId("onboarding-full-name-input"), "Edited name");
    expect(updateData).toHaveBeenLastCalledWith({ full_name: "Edited name" });
    await fireEvent.press(rendered.getByLabelText("Asia / Kathmandu"));
    expect(updateData).toHaveBeenLastCalledWith({ planning_timezone: "Asia/Kathmandu" });
    await rendered.rerender(
      <IdentityStep
        accountIdentity="account-a"
        data={data("Server refresh", "server_name", "Europe/London")}
        updateData={updateData}
      />,
    );
    expect(rendered.getByTestId("onboarding-timezone")).toHaveTextContent("Asia / Kathmandu");
  });
  it("keeps a dirty identity field while refreshing untouched server fields", async () => {
    const updateData = jest.fn();
    const rendered = await render(
      <IdentityStep
        key="account-a"
        accountIdentity="account-a"
        data={data("Server name", "server_name")}
        updateData={updateData}
        usernameAvailability={{ isChecking: false, isError: false }}
      />,
    );

    await fireEvent.changeText(rendered.getByTestId("onboarding-full-name-input"), "Edited name");
    await rendered.rerender(
      <IdentityStep
        key="account-a"
        accountIdentity="account-a"
        data={data("Refreshed server name", "refreshed_username")}
        updateData={updateData}
        usernameAvailability={{ isChecking: false, isError: false }}
      />,
    );

    await act(async () => undefined);
    expect(rendered.getByDisplayValue("Edited name")).toBeTruthy();
    expect(rendered.getByDisplayValue("refreshed_username")).toBeTruthy();
  });
});
