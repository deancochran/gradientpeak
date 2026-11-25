import { act, renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";
import { useDirtyCloseGuard } from "../useDirtyCloseGuard";
import { useDirtyNavigationGuard } from "../useDirtyNavigationGuard";

const mockDispatch = jest.fn();
const mockPreventRemove = jest.fn();
jest.mock("expo-router", () => ({ useNavigation: () => ({ dispatch: mockDispatch }) }));
jest.mock("expo-router/react-navigation", () => ({
  usePreventRemove: (...args: unknown[]) => mockPreventRemove(...args),
}));

const action = { type: "GO_BACK" };

function prevention() {
  const call = mockPreventRemove.mock.calls.at(-1);
  if (!call) throw new Error("Expected native-stack removal protection");
  return {
    enabled: call[0] as boolean,
    block: call[1] as (event: { data: { action: typeof action } }) => void,
  };
}

describe("form discard protection", () => {
  beforeEach(() => {
    mockDispatch.mockClear();
    mockPreventRemove.mockClear();
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("keeps clean routes unblocked and confirms dirty removal", async () => {
    const { rerender } = await renderHook(
      (props: { isDirty: boolean; isPending?: boolean }) => useDirtyNavigationGuard(props),
      { initialProps: { isDirty: false } },
    );
    expect(prevention().enabled).toBe(false);
    await rerender({ isDirty: true });
    expect(prevention().enabled).toBe(true);
    await act(() => prevention().block({ data: { action } }));
    expect(mockDispatch).not.toHaveBeenCalled();
    const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
    expect(buttons?.find((button) => button.text === "Keep editing")?.style).toBe("cancel");
    await act(() => buttons?.find((button) => button.text === "Discard")?.onPress?.());
    expect(mockDispatch).toHaveBeenCalledWith(action);
  });

  it("protects pristine pending saves and cannot pretend discard cancels them", async () => {
    await renderHook(() => useDirtyNavigationGuard({ isDirty: false, isPending: true }));
    expect(prevention().enabled).toBe(true);
    await act(() => prevention().block({ data: { action } }));
    expect(Alert.alert).toHaveBeenCalledWith("Saving changes", expect.any(String));
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("retains dirty protection after a failed save and bypasses after success", async () => {
    const { result, rerender } = await renderHook(
      (props: { isDirty: boolean; isPending?: boolean }) => useDirtyNavigationGuard(props),
      { initialProps: { isDirty: true, isPending: true } },
    );
    await rerender({ isDirty: true, isPending: false });
    expect(prevention().enabled).toBe(true);
    await act(() => result.current.allowNavigationAfterSuccess());
    expect(prevention().enabled).toBe(false);
    await rerender({ isDirty: false, isPending: false });
    await rerender({ isDirty: true, isPending: false });
    expect(prevention().enabled).toBe(true);
  });

  it("blocks modal dismissal while saving even if the draft is clean", async () => {
    const close = jest.fn();
    const { result } = await renderHook(() =>
      useDirtyCloseGuard({ isDirty: false, isPending: true }),
    );
    await act(() => result.current(close));
    expect(close).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith("Saving changes", expect.any(String));
  });

  it("closes a dirty modal only after explicit discard", async () => {
    const close = jest.fn();
    const { result } = await renderHook(() => useDirtyCloseGuard({ isDirty: true }));
    await act(() => result.current(close));
    expect(close).not.toHaveBeenCalled();
    const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
    await act(() => buttons?.find((button) => button.text === "Discard")?.onPress?.());
    expect(close).toHaveBeenCalledTimes(1);
  });
});
