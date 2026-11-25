import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { useZodForm } from "./use-zod-form";

describe("useZodForm", () => {
  afterEach(cleanup);

  it("keeps its return value stable when an effect resets the form", async () => {
    const onReset = vi.fn();
    const { rerender, result } = renderHook(
      ({ amount }) => {
        const form = useZodForm({
          schema: z.object({ amount: z.number() }),
          defaultValues: { amount },
        });

        useEffect(() => {
          onReset();
          form.reset({ amount });
        }, [amount, form]);

        return form;
      },
      { initialProps: { amount: 10 } },
    );
    const initialForm = result.current;

    await waitFor(() => expect(onReset).toHaveBeenCalledTimes(1));

    rerender({ amount: 20 });

    await waitFor(() => expect(onReset).toHaveBeenCalledTimes(2));
    expect(result.current).toBe(initialForm);
    expect(result.current.getValues("amount")).toBe(20);
  });
});
