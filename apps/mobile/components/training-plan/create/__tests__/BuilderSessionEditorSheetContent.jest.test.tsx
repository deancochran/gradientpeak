import { act } from "react";
import { createHost } from "@/test/mock-components";
import { renderNative, screen } from "@/test/render-native";

const defaultVariantId = "11111111-1111-4111-8111-111111111111";
const explicitVariantId = "22222222-2222-4222-8222-222222222222";
const activityPlanId = "33333333-3333-4333-8333-333333333333";

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@/components/shared/AppBottomSheet", () => ({
  __esModule: true,
  AppBottomSheetContent: createHost("AppBottomSheetContent"),
}));

jest.mock("@/components/training-plan/create/TrainingPlanBuilderEventCard", () => ({
  __esModule: true,
  TrainingPlanBuilderEventEditor: createHost("TrainingPlanBuilderEventEditor"),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    activityPlans: {
      getById: {
        useQuery: () => ({
          data: {
            detail: {
              defaultVariantId,
              variants: [
                { id: defaultVariantId, name: "Base" },
                { id: explicitVariantId, name: "Long" },
              ],
            },
          },
        }),
      },
    },
  },
}));

import { BuilderSessionEditorContent } from "../BuilderSessionEditorSheetContent";

const activityPlan = {
  id: activityPlanId,
  name: "Tempo",
  published: true,
  accessible: true,
  prescriptionQuantification: null,
};

describe("BuilderSessionEditorContent activity-plan variants", () => {
  it("allows an explicit variant and can return to server-default selection", async () => {
    const onChange = jest.fn();
    const baseProps = {
      activityPlan: null,
      onChange,
      onDuplicate: jest.fn(),
      onOpenActivityPicker: jest.fn(),
      onRemove: jest.fn(),
    };
    const initialSession = {
      localId: "session-1",
      offsetDays: 0,
      activityPlan,
    };
    const view = await renderNative(
      <BuilderSessionEditorContent {...baseProps} session={initialSession} />,
    );

    expect(
      screen.getByTestId("training-plan-session-variant-current-default").props.accessibilityState,
    ).toEqual({ selected: true });
    await act(() => {
      screen.getByTestId(`training-plan-session-variant-${explicitVariantId}`).props.onPress();
    });
    expect(onChange).toHaveBeenLastCalledWith({
      ...initialSession,
      activityPlanVariantId: explicitVariantId,
    });

    await view.rerender(
      <BuilderSessionEditorContent
        {...baseProps}
        session={{ ...initialSession, activityPlanVariantId: explicitVariantId }}
      />,
    );
    await act(() => {
      screen.getByTestId("training-plan-session-variant-current-default").props.onPress();
    });
    expect(onChange).toHaveBeenLastCalledWith(initialSession);
  });
});
