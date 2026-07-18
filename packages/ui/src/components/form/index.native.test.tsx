import * as React from "react";
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

function FormHarness({ invalid = false }: { invalid?: boolean }) {
  const methods = useForm({
    defaultValues: {
      email: "avery@example.com",
    },
  });

  React.useEffect(() => {
    if (invalid) {
      methods.setError("email", { message: "Email is required.", type: "required" });
    }
  }, [invalid, methods]);

  return (
    <Form {...methods}>
      <FormField
        control={methods.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input
                {...field}
                accessibilityLabel="Email address"
                accessibilityState={{ selected: true }}
                testId="email-input"
              />
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
    const { getByTestId, getByText } = renderNative(<FormHarness />);

    expect(getByTestId("email-input").props.accessibilityLabel).toBe("Email address");
    expect(getByText("Used for weekly updates.")).toBeTruthy();
    expect(getByText("Field is required.")).toBeTruthy();
  });

  it("associates the visible label while preserving supported explicit accessibility props", () => {
    const { getByTestId, getByText } = renderNative(<FormHarness />);
    const control = getByTestId("email-input");
    const label = getByText("Email");

    expect(control.props.accessibilityLabel).toBe("Email address");
    expect(control.props.accessibilityLabelledBy).toBe(label.props.nativeID);
    expect(control.props.accessibilityState).toEqual({ selected: true });
    expect(control.props).not.toHaveProperty("aria-describedby");
    expect(control.props).not.toHaveProperty("aria-invalid");
    expect(control.props).not.toHaveProperty("accessibilityInvalid");
  });

  it("exposes invalid state and announces validation errors", () => {
    const { getByTestId, getByText } = renderNative(<FormHarness invalid />);
    const control = getByTestId("email-input");
    const message = getByText("Email is required.");

    expect(control.props.accessibilityState).toEqual({ selected: true });
    expect(control.props.accessibilityHint).toBe("Invalid: Email is required.");
    expect(control.props).not.toHaveProperty("aria-invalid");
    expect(control.props).not.toHaveProperty("accessibilityInvalid");
    expect(message.props.accessibilityRole).toBe("alert");
    expect(message.props.accessibilityLiveRegion).toBe("assertive");
  });
});
