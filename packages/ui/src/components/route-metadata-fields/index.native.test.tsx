import { useForm } from "react-hook-form";
import { fireEvent, renderNative } from "../../test/render-native";
import { Form } from "../form/index.native";
import { RouteMetadataFields } from "./index.native";

describe("RouteMetadataFields native", () => {
  it("binds required route name and optional description with stable selectors", async () => {
    function Harness() {
      const form = useForm({ defaultValues: { description: "", name: "" } });
      return (
        <Form {...form}>
          <RouteMetadataFields
            control={form.control}
            descriptionTestId="route-description"
            nameTestId="route-name"
          />
        </Form>
      );
    }

    const { getByTestId, getByText } = await renderNative(<Harness />);
    const name = getByTestId("route-name");
    const description = getByTestId("route-description");
    await fireEvent(name, "onChangeText", "Ridge loop");
    await fireEvent(description, "onChangeText", "Steep northern access");

    expect(name.props.value).toBe("Ridge loop");
    expect(description.props.value).toBe("Steep northern access");
    expect(getByText("Optional notes about terrain, access, or intended use.")).toBeTruthy();
  });
});
