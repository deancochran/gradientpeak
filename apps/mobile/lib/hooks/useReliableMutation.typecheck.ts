import { api } from "@/lib/api";
import { useReliableMutation } from "./useReliableMutation";

type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends <T>() => T extends TRight ? 1 : 2
    ? (<T>() => T extends TRight ? 1 : 2) extends <T>() => T extends TLeft ? 1 : 2
      ? true
      : false
    : false;
type Expect<TValue extends true> = TValue;
type IsAny<TValue> = 0 extends 1 & TValue ? true : false;

function useVerifyReliableMutationInference() {
  const mutation = useReliableMutation(api.integrations.getAuthUrl, {
    onMutate: () => ({ requestedAt: Date.now() }),
    onSuccess: (data, variables, onMutateResult) => {
      const url: string = data.url;
      const redirectUri: string | undefined = variables.redirectUri;
      const requestedAt: number = onMutateResult.requestedAt;
      // @ts-expect-error -- getAuthUrl success data does not contain a training-plan id.
      data.id;
      // @ts-expect-error -- the inferred mutation context only contains requestedAt.
      onMutateResult.previousId;
      return { redirectUri, requestedAt, url };
    },
    onError: (error, variables) => {
      const message: string = error.message;
      // @ts-expect-error -- the inferred tRPC client error has no retryable property.
      error.retryable;
      return { message, provider: variables.provider };
    },
  });

  type DirectMutation = ReturnType<typeof api.integrations.getAuthUrl.useMutation>;
  type InferredInput = Parameters<typeof mutation.mutate>[0];
  type InferredData = NonNullable<typeof mutation.data>;
  type InferredError = NonNullable<typeof mutation.error>;
  type MutationCallOptions = NonNullable<Parameters<typeof mutation.mutate>[1]>;
  type InferredContext = Parameters<NonNullable<MutationCallOptions["onSuccess"]>>[2];
  type _InputIsExact = Expect<Equal<InferredInput, Parameters<DirectMutation["mutate"]>[0]>>;
  type _DataIsExact = Expect<Equal<InferredData, NonNullable<DirectMutation["data"]>>>;
  type _ErrorIsExact = Expect<Equal<InferredError, NonNullable<DirectMutation["error"]>>>;
  type _ContextIsExact = Expect<Equal<InferredContext, { requestedAt: number } | undefined>>;
  type _InputIsNotAny = Expect<Equal<IsAny<InferredInput>, false>>;
  type _DataIsNotAny = Expect<Equal<IsAny<InferredData>, false>>;
  type _ErrorIsNotAny = Expect<Equal<IsAny<InferredError>, false>>;
  type _ContextIsNotAny = Expect<Equal<IsAny<InferredContext>, false>>;

  const mutateReturn = mutation.mutate({
    provider: "strava",
    redirectUri: "gradientpeak://integrations",
  });
  type _MutateReturnIsExact = Expect<Equal<typeof mutateReturn, void>>;

  // @ts-expect-error -- getAuthUrl requires a supported provider in its input payload.
  mutation.mutate({ redirectUri: "gradientpeak://integrations" });

  async function verifySuccessData() {
    const data = await mutation.mutateAsync({
      provider: "wahoo",
      redirectUri: "gradientpeak://integrations",
    });
    const url: string = data.url;
    // @ts-expect-error -- getAuthUrl success data does not contain a training-plan id.
    data.id;
    return url;
  }

  return { mutateReturn, verifySuccessData };
}

export type ReliableMutationInferenceCheck = ReturnType<typeof useVerifyReliableMutationInference>;
