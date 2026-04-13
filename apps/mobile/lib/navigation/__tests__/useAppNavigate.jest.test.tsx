import { act, renderHook } from "@testing-library/react-native";

const navigateMock = jest.fn();
const pushMock = jest.fn();
const routerState: {
  value: { navigate?: typeof navigateMock; push?: typeof pushMock };
} = {
  value: { navigate: navigateMock, push: pushMock },
};

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => routerState.value,
}));

describe("useAppNavigate", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    pushMock.mockReset();
    routerState.value = { navigate: navigateMock, push: pushMock };
  });

  it("routes through navigate to reuse existing stack entries", async () => {
    const { useAppNavigate } = await import("../useAppNavigate");
    const { result } = renderHook(() => useAppNavigate());

    act(() => {
      result.current("/messages" as any);
    });

    expect(navigateMock).toHaveBeenCalledWith("/messages");
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("falls back to push when navigate is unavailable", async () => {
    routerState.value = { push: pushMock };
    const { useAppNavigate } = await import("../useAppNavigate");
    const { result } = renderHook(() => useAppNavigate());

    act(() => {
      result.current("/messages" as any);
    });

    expect(pushMock).toHaveBeenCalledWith("/messages");
  });
});
