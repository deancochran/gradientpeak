import type { ReactNode } from "react";
import { createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

const profile = {
  avatar_url: null,
  cover_url: null,
  full_name: "Riley Chen",
  username: "riley",
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
}));
jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: { Screen: createHost("StackScreen") },
  useRouter: () => ({ back: jest.fn() }),
}));
jest.mock("expo-file-system", () => ({ File: jest.fn() }));
jest.mock("expo-image-picker", () => ({}));
jest.mock("lucide-react-native", () => ({
  Camera: createHost("Camera"),
  ImagePlus: createHost("ImagePlus"),
  X: createHost("X"),
}));
jest.mock("@repo/tailwindcss/native", () => ({
  THEME: { light: { primaryForeground: "white" } },
}));
jest.mock("@repo/ui/components/avatar", () => ({
  Avatar: createHost("Avatar"),
  AvatarFallback: createHost("AvatarFallback"),
  AvatarImage: createHost("AvatarImage"),
}));
jest.mock("@repo/ui/components/card", () => ({
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
  CardHeader: createHost("CardHeader"),
  CardTitle: createHost("CardTitle"),
}));
jest.mock("@repo/ui/components/form", () => ({
  Form: ({ children }: { children: ReactNode }) => children,
  FormDateInputField: createHost("FormDateInputField"),
  FormSegmentedSelectField: createHost("FormSegmentedSelectField"),
  FormSwitchField: createHost("FormSwitchField"),
  FormTextareaField: createHost("FormTextareaField"),
  FormTextField: createHost("FormTextField"),
}));
jest.mock("@repo/ui/components/icon", () => ({ Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/loading", () => ({ LoadingButton: createHost("LoadingButton") }));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@repo/ui/hooks", () => ({
  useZodForm: ({ defaultValues }: { defaultValues: typeof profile }) => ({
    control: {},
    reset: jest.fn(),
    watch: (name: keyof typeof profile) => defaultValues[name],
  }),
  useZodFormSubmit: () => ({
    getSubmitButtonState: () => ({ disabled: false, label: "Save", loading: false }),
    handleSubmit: jest.fn(),
    isSubmitting: false,
  }),
}));
jest.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
  ScreenErrorFallback: () => null,
}));
jest.mock("@/components/shared/AppFormModal", () => ({ AppConfirmModal: () => null }));
jest.mock("@/components/shared/AppSelectionModal", () => ({ AppSelectionModal: () => null }));
jest.mock("@/lib/api", () => ({
  api: {
    useUtils: () => ({ profiles: { invalidate: jest.fn() } }),
    profiles: { update: { useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }) } },
    storage: {
      createSignedUploadUrl: { useMutation: () => ({ mutateAsync: jest.fn() }) },
      getSignedUrl: { useQuery: () => ({ data: undefined }) },
    },
  },
}));
jest.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ profile, refreshProfile: jest.fn() }),
}));
jest.mock("@/lib/server-config", () => ({ getReachableSupabaseStorageUrl: (url: string) => url }));
jest.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: { getState: () => ({ setProfile: jest.fn() }) },
}));
jest.mock("@/lib/stores/theme-store", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
jest.mock("@/lib/utils/formErrors", () => ({ handleSubmitFormError: jest.fn() }));

const ProfileEdit = require("../profile-edit").default;

it("renders the loaded required full name above username", () => {
  renderNative(<ProfileEdit />);

  const fields = screen.UNSAFE_getAllByType("FormTextField" as never);
  expect(fields.map((field) => field.props.name)).toEqual(["full_name", "username"]);
  expect(fields[0]?.props).toEqual(
    expect.objectContaining({ label: "Full Name *", testId: "profile-edit-full-name" }),
  );
});
