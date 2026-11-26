import { cleanup, fireEvent } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it } from "vitest";
import { renderWeb, screen } from "../../test/render-web";
import { Form } from "../form/index.web";
import { RouteMetadataFields } from "./index.web";

afterEach(cleanup);

describe("RouteMetadataFields web", () => {
  it("binds required route name and optional description with stable selectors", () => {
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

    renderWeb(<Harness />);
    fireEvent.change(screen.getByTestId("route-name"), { target: { value: "Ridge loop" } });
    fireEvent.change(screen.getByTestId("route-description"), {
      target: { value: "Steep northern access" },
    });

    expect(screen.getByLabelText("Route name")).toHaveValue("Ridge loop");
    expect(screen.getByLabelText("Description")).toHaveValue("Steep northern access");
    expect(screen.getByText("Optional notes about terrain, access, or intended use.")).toBeTruthy();
  });
});
