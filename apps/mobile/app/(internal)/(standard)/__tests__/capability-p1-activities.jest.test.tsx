import type React from "react";
import { createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

jest.mock("react-native", () => ({
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
  ScrollView: createHost("ScrollView"),
}));
jest.mock("@/lib/api", () => ({
  api: {
    useUtils: () => ({ activities: { invalidate: jest.fn() } }),
    activityFiles: {
      getSignedUploadUrl: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      processActivityFile: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
    },
  },
}));
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}) }));
jest.mock("@repo/api/client", () => ({ invalidatePostActivityIngestionQueries: jest.fn() }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("@/lib/navigation/useAppNavigate", () => ({ useAppNavigate: () => jest.fn() }));
jest.mock("@/lib/services/fit/ActivityFileUploader", () => ({ ActivityFileUploader: jest.fn() }));
jest.mock("@repo/ui/components/icon", () => ({ Icon: createHost("Icon") }));
jest.mock("lucide-react-native", () => ({ History: createHost("History") }));
jest.mock("@repo/ui/components/button", () => ({ Button: createHost("Button") }));
jest.mock("@repo/ui/components/card", () => ({
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@repo/ui/components/loading", () => ({ LoadingButton: createHost("LoadingButton") }));
jest.mock("@repo/ui/components/form", () => ({
  Form: ({ children }: { children: React.ReactNode }) => children,
  FormFileField: createHost("FormFileField"),
  FormTextareaField: createHost("FormTextareaField"),
}));
jest.mock("@repo/ui/hooks", () => ({
  useZodForm: () => ({
    control: {},
    watch: (callback?: () => void) => (callback ? { unsubscribe: jest.fn() } : []),
    getValues: () => ({}),
    getFieldState: () => ({}),
    setValue: jest.fn(),
    setError: jest.fn(),
    clearErrors: jest.fn(),
    reset: jest.fn(),
  }),
  useZodFormSubmit: () => ({ handleSubmit: jest.fn() }),
}));

describe("P1 activity import screen boundary", () => {
  it("renders the historical import entry point without device-picker proof", () => {
    const Screen = require("../activity-import").default;
    renderNative(<Screen />);
    expect(screen.getByText("Import Activity History")).toBeTruthy();
    expect(screen.getByText("Import Activity")).toBeTruthy();
  });
});
