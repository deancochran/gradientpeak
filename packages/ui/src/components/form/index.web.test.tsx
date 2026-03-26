import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { Input } from "../input/index.web";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./index.web";

function FormHarness() {
  const methods = useForm({
    defaultValues: {
      email: "avery@example.com",
    },
  });

  return (
    <Form {...methods}>
      <FormField
        control={methods.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input {...field} accessibilityLabel="Email" testId="email-input" />
            </FormControl>
            <FormDescription>Used for weekly updates.</FormDescription>
            <FormMessage>Field is required.</FormMessage>
          </FormItem>
        )}
      />
    </Form>
  );
}

describe("Form web", () => {
  it("renders shared form primitives with description and message", () => {
    renderWeb(<FormHarness />);

    expect(screen.getByLabelText("Email")).toHaveValue("avery@example.com");
    expect(screen.getByText("Used for weekly updates.")).toBeInTheDocument();
    expect(screen.getByText("Field is required.")).toBeInTheDocument();
  });
});
