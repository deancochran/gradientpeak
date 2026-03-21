import { zodResolver } from "@hookform/resolvers/zod";
import {
  type DefaultValues,
  type FieldValues,
  type Resolver,
  type UseFormProps,
  useForm,
} from "react-hook-form";
import type { ZodTypeAny, z } from "zod";

type FormSchema = ZodTypeAny;

type UseZodFormOptions<TSchema extends FormSchema, TContext> = Omit<
  UseFormProps<z.input<TSchema> & FieldValues, TContext, z.output<TSchema>>,
  "resolver"
> & {
  schema: TSchema;
  defaultValues?: DefaultValues<z.input<TSchema> & FieldValues>;
};

export function useZodForm<TSchema extends FormSchema, TContext = undefined>({
  schema,
  mode = "onSubmit",
  reValidateMode = "onChange",
  ...options
}: UseZodFormOptions<TSchema, TContext>) {
  return useForm<z.input<TSchema> & FieldValues, TContext, z.output<TSchema>>({
    ...options,
    mode,
    reValidateMode,
    resolver: zodResolver(schema as never) as unknown as Resolver<
      z.input<TSchema> & FieldValues,
      TContext,
      z.output<TSchema>
    >,
  });
}
