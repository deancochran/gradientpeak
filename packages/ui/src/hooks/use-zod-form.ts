import { zodResolver } from "@hookform/resolvers/zod";
import {
  type DefaultValues,
  type FieldValues,
  type Resolver,
  type UseFormProps,
  type UseFormReturn,
  useForm,
} from "react-hook-form";
import type { ZodTypeAny, z } from "zod";

type InferredUseZodFormOptions<TSchema extends ZodTypeAny, TContext> = Omit<
  UseFormProps<z.input<TSchema> & FieldValues, TContext, z.output<TSchema> & FieldValues>,
  "resolver"
> & {
  schema: TSchema;
  defaultValues?: DefaultValues<z.input<TSchema> & FieldValues>;
};

type UseZodFormOptions<
  TFieldValues extends FieldValues,
  TContext,
  TTransformedValues extends FieldValues | undefined,
> = Omit<UseFormProps<TFieldValues, TContext, TTransformedValues>, "resolver"> & {
  schema: unknown;
  defaultValues?: DefaultValues<TFieldValues>;
};

export function useZodForm<TSchema extends ZodTypeAny, TContext = undefined>(
  options: InferredUseZodFormOptions<TSchema, TContext>,
): UseFormReturn<z.input<TSchema> & FieldValues, TContext, z.output<TSchema> & FieldValues>;

export function useZodForm<
  TFieldValues extends FieldValues = FieldValues,
  TContext = undefined,
  TTransformedValues extends FieldValues | undefined = TFieldValues,
>(
  options: UseZodFormOptions<TFieldValues, TContext, TTransformedValues>,
): UseFormReturn<TFieldValues, TContext, TTransformedValues>;

export function useZodForm<
  TFieldValues extends FieldValues = FieldValues,
  TContext = undefined,
  TTransformedValues extends FieldValues | undefined = TFieldValues,
>({
  schema,
  mode = "onSubmit",
  reValidateMode = "onChange",
  ...options
}: UseZodFormOptions<TFieldValues, TContext, TTransformedValues>) {
  return useForm<TFieldValues, TContext, TTransformedValues>({
    ...options,
    mode,
    reValidateMode,
    resolver: zodResolver(schema as never) as unknown as Resolver<
      TFieldValues,
      TContext,
      TTransformedValues
    >,
  });
}
