import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { UseTRPCMutationOptions, UseTRPCMutationResult } from "@trpc/react-query/shared";
import type { PropsWithChildren } from "react";
import { showErrorAlert } from "@/lib/utils/formErrors";
import { useReliableMutation } from "./useReliableMutation";

jest.mock("@/lib/utils/formErrors", () => ({
  showErrorAlert: jest.fn(),
}));

interface TestInput {
  id: string;
}

interface TestOutput {
  id: string;
  saved: boolean;
}

function createMutationHook(mutationFn: (input: TestInput) => Promise<TestOutput>) {
  return {
    useMutation<TContext = unknown>(
      options?: UseTRPCMutationOptions<TestInput, Error, TestOutput, TContext>,
    ): UseTRPCMutationResult<TestOutput, Error, TestInput, TContext> {
      const result = useMutation<TestOutput, Error, TestInput, TContext>({
        mutationFn,
        ...options,
      });

      return { ...result, trpc: { path: "test.save" } };
    },
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retryDelay: 0 },
    },
  });

  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useReliableMutation", () => {
  it("preserves retries, mutation context, success callbacks, and invalidation", async () => {
    const mutationFn = jest
      .fn<Promise<TestOutput>, [TestInput]>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue({ id: "plan-1", saved: true });
    const invalidate = jest.fn(async () => undefined);
    const onSuccess = jest.fn();
    const mutation = createMutationHook(mutationFn);

    const { result } = renderHook(
      () =>
        useReliableMutation(mutation, {
          invalidate: [{ invalidate }],
          retry: 1,
          onMutate: (variables) => ({ previousId: variables.id }),
          onSuccess,
          silent: true,
        }),
      { wrapper: createWrapper() },
    );

    let data: TestOutput | undefined;
    await act(async () => {
      data = await result.current.mutateAsync({ id: "plan-1" });
    });

    expect(data).toEqual({ id: "plan-1", saved: true });
    expect(mutationFn).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(
      { id: "plan-1", saved: true },
      { id: "plan-1" },
      { previousId: "plan-1" },
      expect.objectContaining({ client: expect.any(QueryClient) }),
    );
  });

  it("awaits the error callback before settling and exposing the mutation rejection", async () => {
    const error = new Error("permanent");
    const mutationFn = jest.fn<Promise<TestOutput>, [TestInput]>().mockRejectedValue(error);
    const events: string[] = [];
    let completeOnError: () => void = () => {};
    const onErrorCompletion = new Promise<void>((resolve) => {
      completeOnError = resolve;
    });
    const onError = jest.fn(async () => {
      events.push("onError:start");
      await onErrorCompletion;
      events.push("onError:complete");
    });
    const mutation = createMutationHook(mutationFn);

    const { result } = renderHook(
      () =>
        useReliableMutation(mutation, {
          retry: 1,
          onError,
          onSettled: () => {
            events.push("onSettled");
          },
        }),
      { wrapper: createWrapper() },
    );

    let handledRejection: Promise<Error> | undefined;
    act(() => {
      handledRejection = result.current.mutateAsync({ id: "plan-2" }).then(
        () => new Error("Expected mutation to reject"),
        (mutationError: Error) => {
          events.push("rejection:handled");
          return mutationError;
        },
      );
    });

    await waitFor(() => expect(events).toEqual(["onError:start"]));
    expect(showErrorAlert).not.toHaveBeenCalled();

    await act(async () => {
      completeOnError();
      await expect(handledRejection).resolves.toBe(error);
    });

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(mutationFn).toHaveBeenCalledTimes(2);
    expect(showErrorAlert).toHaveBeenCalledWith(error);
    expect(events).toEqual(["onError:start", "onError:complete", "onSettled", "rejection:handled"]);
  });

  it("routes an async error-callback rejection through mutateAsync without an unhandled promise", async () => {
    const mutationError = new Error("mutation failed");
    const callbackError = new Error("error callback failed");
    const mutationFn = jest.fn<Promise<TestOutput>, [TestInput]>().mockRejectedValue(mutationError);
    const unhandledRejection = jest.fn();
    const mutation = createMutationHook(mutationFn);

    process.on("unhandledRejection", unhandledRejection);
    try {
      const { result } = renderHook(
        () =>
          useReliableMutation(mutation, {
            retry: false,
            onError: async () => {
              throw callbackError;
            },
          }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await expect(result.current.mutateAsync({ id: "plan-3" })).rejects.toBe(callbackError);
      });
      await Promise.resolve();

      expect(unhandledRejection).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandledRejection);
    }
  });
});
