import { fireEvent, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

let mockProfile: {
  id: string;
  avatar_url: string | null;
  cover_url: string | null;
  full_name: string;
  username: string;
} = {
  id: "user-1",
  avatar_url: null,
  cover_url: null,
  full_name: "Riley Chen",
  username: "riley",
};
const mockUpdateProfile = jest.fn();
const mockCompareAndSwapMedia = jest.fn();
const mockCreateSignedUploadUrl = jest.fn();
const mockDeleteFile = jest.fn();
const mockRefreshProfile = jest.fn();
const mockInvalidateProfiles = jest.fn();
const mockRequestMediaLibraryPermissions = jest.fn();
const mockLaunchImageLibrary = jest.fn();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
}));
jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: { Screen: createHost("StackScreen") },
  useRouter: () => ({ back: jest.fn() }),
}));
jest.mock("expo-file-system", () => ({
  File: jest.fn((uri: string) => ({ exists: true, uri })),
}));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) =>
    mockRequestMediaLibraryPermissions(...args),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibrary(...args),
}));
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
  useZodForm: ({ defaultValues }: { defaultValues: typeof mockProfile }) => ({
    control: {},
    reset: jest.fn(),
    watch: (name: keyof typeof mockProfile) => defaultValues[name],
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
jest.mock("@/components/shared/AppSelectionModal", () => ({
  AppSelectionModal: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("@/lib/api", () => ({
  api: {
    useUtils: () => ({ profiles: { invalidate: mockInvalidateProfiles } }),
    profiles: {
      update: {
        useMutation: () => ({ isPending: false, mutateAsync: mockUpdateProfile }),
      },
      compareAndSwapMedia: {
        useMutation: () => ({ isPending: false, mutateAsync: mockCompareAndSwapMedia }),
      },
    },
    storage: {
      createSignedUploadUrl: { useMutation: () => ({ mutateAsync: mockCreateSignedUploadUrl }) },
      deleteFile: { useMutation: () => ({ mutateAsync: mockDeleteFile }) },
      getSignedUrl: {
        useQuery: ({ filePath }: { filePath: string }) => ({
          data: filePath ? { signedUrl: "https://example.com/signed-profile-image" } : undefined,
        }),
      },
    },
  },
}));
jest.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ profile: mockProfile, refreshProfile: mockRefreshProfile }),
}));
jest.mock("@/lib/server-config", () => ({ getReachableSupabaseStorageUrl: (url: string) => url }));
jest.mock("@/lib/stores/theme-store", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
jest.mock("@/lib/utils/formErrors", () => ({ handleSubmitFormError: jest.fn() }));

const ProfileEdit = require("../profile-edit").default;

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile = {
    id: "user-1",
    avatar_url: null,
    cover_url: null,
    full_name: "Riley Chen",
    username: "riley",
  };
  mockRequestMediaLibraryPermissions.mockResolvedValue({ status: "granted" });
  mockLaunchImageLibrary.mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///avatar.jpg" }],
  });
  mockCreateSignedUploadUrl.mockResolvedValue({
    signedUrl: "https://example.com/signed-upload",
    path: "user-1/new-avatar.jpg",
    publicUrl: "https://example.com/public-avatar",
  });
  mockCompareAndSwapMedia.mockResolvedValue({ success: true });
  mockDeleteFile.mockResolvedValue({ success: true });
  mockRefreshProfile.mockResolvedValue(undefined);
  mockInvalidateProfiles.mockResolvedValue(undefined);
  global.fetch = jest.fn().mockResolvedValue({
    blob: jest.fn().mockResolvedValue(new Blob(["avatar"])),
    ok: true,
    statusText: "OK",
  });
});

it("renders the loaded required full name above username", () => {
  renderNative(<ProfileEdit />);

  const fields = screen.UNSAFE_getAllByType("FormTextField" as never);
  expect(fields.map((field) => field.props.name)).toEqual([
    "full_name",
    "username",
    "planning_timezone",
  ]);
  expect(fields[0]?.props).toEqual(
    expect.objectContaining({ label: "Full Name *", testId: "profile-edit-full-name" }),
  );
});

it("uploads with the returned path and commits it through profile media CAS", async () => {
  renderNative(<ProfileEdit />);

  fireEvent.press(screen.getByTestId("profile-edit-avatar-button"));
  fireEvent.press(screen.getByTestId("profile-avatar-source-library"));

  await waitFor(() =>
    expect(mockCompareAndSwapMedia).toHaveBeenCalledWith({
      field: "avatar_url",
      expected: null,
      next: "user-1/new-avatar.jpg",
    }),
  );
  expect(mockUpdateProfile).not.toHaveBeenCalled();
  expect(mockDeleteFile).not.toHaveBeenCalled();
});

it("deletes the just-uploaded object when media CAS fails", async () => {
  const originalConsoleError = console.error;
  console.error = jest.fn();
  mockCompareAndSwapMedia.mockRejectedValueOnce(
    Object.assign(new Error("Conflict"), {
      data: { code: "CONFLICT" },
    }),
  );
  renderNative(<ProfileEdit />);

  fireEvent.press(screen.getByTestId("profile-edit-avatar-button"));
  fireEvent.press(screen.getByTestId("profile-avatar-source-library"));

  await waitFor(() =>
    expect(mockDeleteFile).toHaveBeenCalledWith({ filePath: "user-1/new-avatar.jpg" }),
  );
  console.error = originalConsoleError;
});

it("clears with the stored value as expected and deletes only the prior owned path", async () => {
  mockProfile = { ...mockProfile, avatar_url: "user-1/old-avatar.jpg" };
  renderNative(<ProfileEdit />);

  fireEvent.press(screen.getByLabelText("Remove profile picture"));

  await waitFor(() =>
    expect(mockCompareAndSwapMedia).toHaveBeenCalledWith({
      field: "avatar_url",
      expected: "user-1/old-avatar.jpg",
      next: null,
    }),
  );
  expect(mockDeleteFile).toHaveBeenCalledWith({ filePath: "user-1/old-avatar.jpg" });
  expect(mockUpdateProfile).not.toHaveBeenCalled();
});

it.each([
  "https://cdn.example.com/avatar.jpg",
  "another-user/avatar.jpg",
])("does not delete an unowned prior value after a successful clear: %s", async (unownedValue) => {
  mockProfile = { ...mockProfile, avatar_url: unownedValue };
  renderNative(<ProfileEdit />);

  fireEvent.press(screen.getByLabelText("Remove profile picture"));

  await waitFor(() =>
    expect(mockCompareAndSwapMedia).toHaveBeenCalledWith({
      field: "avatar_url",
      expected: unownedValue,
      next: null,
    }),
  );
  expect(mockDeleteFile).not.toHaveBeenCalled();
});
