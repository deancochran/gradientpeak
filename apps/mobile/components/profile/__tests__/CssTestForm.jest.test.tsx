import { fireEvent, renderNative, screen, waitFor } from "../../../test/render-native";
import { CssTestForm } from "../CssTestForm";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
}));

let mockUuidCounter = 0;
jest.mock("expo-crypto", () => ({
  randomUUID: () => `22222222-2222-4222-8222-${String(++mockUuidCounter).padStart(12, "0")}`,
}));

describe("CssTestForm", () => {
  it("shows a live /100m preview and atomically submits both times", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ css_seconds_per_100m: 101 });
    renderNative(<CssTestForm onSubmit={onSubmit} />);

    expect(screen.getByText("1:36 /100m")).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("css-test-time400Seconds"), "6:10");
    expect(screen.getByText("1:41 /100m")).toBeTruthy();
    fireEvent.press(screen.getByTestId("css-test-submit"));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      operationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      recordedAt: expect.any(Date),
      time400Seconds: 370,
      time200Seconds: 168,
    });
    expect(await screen.findByText("CSS recorded: 1:41 /100m")).toBeTruthy();
  });

  it("shows an explicit paired-time validation message without submitting", async () => {
    const onSubmit = jest.fn();
    renderNative(<CssTestForm onSubmit={onSubmit} />);

    fireEvent.changeText(screen.getByTestId("css-test-time400Seconds"), "5:30");
    fireEvent.press(screen.getByTestId("css-test-submit"));

    expect(
      await screen.findByText(/400m time must be greater than twice the 200m time/),
    ).toBeTruthy();
    expect(screen.getByText("Enter valid test times")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps mutation failure feedback visible", async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error("Connection lost"));
    renderNative(<CssTestForm onSubmit={onSubmit} />);

    fireEvent.press(screen.getByTestId("css-test-submit"));

    expect(await screen.findByText("CSS test was not recorded: Connection lost")).toBeTruthy();
  });

  it("retains one operation across an ambiguous retry and rotates it after success", async () => {
    const onSubmit = jest
      .fn()
      .mockRejectedValueOnce(new Error("Connection lost"))
      .mockResolvedValue({ css_seconds_per_100m: 96 });
    renderNative(<CssTestForm onSubmit={onSubmit} />);

    fireEvent.press(screen.getByTestId("css-test-submit"));
    await screen.findByText("CSS test was not recorded: Connection lost");
    fireEvent.press(screen.getByTestId("css-test-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));

    expect(onSubmit.mock.calls[1]?.[0].operationId).toBe(onSubmit.mock.calls[0]?.[0].operationId);
    expect(onSubmit.mock.calls[1]?.[0].recordedAt).toEqual(onSubmit.mock.calls[0]?.[0].recordedAt);

    fireEvent.press(screen.getByTestId("css-test-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(3));
    expect(onSubmit.mock.calls[2]?.[0].operationId).not.toBe(
      onSubmit.mock.calls[1]?.[0].operationId,
    );
  });
});
