import { useForm } from "react-hook-form";

import { renderNative } from "../../test/render-native";
import { Input } from "../input/index.native";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./index.native";

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

describe("Form native", () => {
  it("renders shared form primitives with description and message", () => {
    const { getByLabelText, getByText } = renderNative(<FormHarness />);

    expect(getByLabelText("Email")).toBeTruthy();
    expect(getByText("Used for weekly updates.")).toBeTruthy();
    expect(getByText("Field is required.")).toBeTruthy();
  });
});
