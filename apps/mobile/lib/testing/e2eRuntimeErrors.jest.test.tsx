import { act, renderNative, screen } from "../../test/render-native";

const originalE2E = process.env.EXPO_PUBLIC_MAESTRO_E2E;
process.env.EXPO_PUBLIC_MAESTRO_E2E = "1";

const { captureE2EQueryError, clearE2ERuntimeErrors, E2ERuntimeErrorStatus } =
  require("./e2eRuntimeErrors") as typeof import("./e2eRuntimeErrors");

describe("E2ERuntimeErrorStatus", () => {
  beforeEach(() => {
    clearE2ERuntimeErrors();
  });

  afterAll(() => {
    if (originalE2E === undefined) {
      delete process.env.EXPO_PUBLIC_MAESTRO_E2E;
    } else {
      process.env.EXPO_PUBLIC_MAESTRO_E2E = originalE2E;
    }
  });

  it("rerenders its beacon when a classified query error is captured and cleared", () => {
    renderNative(<E2ERuntimeErrorStatus />);
    expect(screen.getByText("E2E_RUNTIME_ERRORS=0")).toBeTruthy();

    const error = new Error("Failed query: << query #1 trainingPlan.list");
    act(() => {
      captureE2EQueryError(error, "query_cache");
      captureE2EQueryError(error, "query_cache");
    });
    expect(screen.getByText("E2E_RUNTIME_ERRORS=1")).toBeTruthy();
    expect(
      screen.getByText("E2E_RUNTIME_LATEST=server_query_failure:trainingPlan.list"),
    ).toBeTruthy();

    act(() => {
      captureE2EQueryError(
        new Error('TRPCClientError: Aborted << query #2 activity.list {"elapsedMs": 30000}'),
        "query_cache",
      );
    });
    expect(screen.getByText("E2E_RUNTIME_ERRORS=2")).toBeTruthy();
    expect(screen.getByText("E2E_RUNTIME_LATEST=timeout_abort:activity.list")).toBeTruthy();

    act(() => {
      captureE2EQueryError(
        new Error('TRPCClientError: Aborted << query #3 activity.get {"elapsedMs": 100}'),
        "query_cache",
      );
    });
    expect(screen.getByText("E2E_RUNTIME_ERRORS=2")).toBeTruthy();

    act(() => {
      clearE2ERuntimeErrors();
    });
    expect(screen.getByText("E2E_RUNTIME_ERRORS=0")).toBeTruthy();
  });
});
