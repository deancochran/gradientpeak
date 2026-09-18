import { act, fireEvent, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { ProfileEditForm } from "@/lib/profile/profile-edit-form";
import { createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

let mockProfile: {
  id: string;
  avatar_url: string | null;
  cover_url: string | null;
  full_name: string;
  username: string;
  planning_timezone?: string | null;
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
const mockInvalidateProfileIdentityQueries = jest.fn();
const mockRequestMediaLibraryPermissions = jest.fn();
const mockLaunchImageLibrary = jest.fn();
let mockForm: UseFormReturn<ProfileEditForm>;

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
}));
jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: { Screen: createHost("StackScreen") },
  useNavigation: () => ({ dispatch: jest.fn() }),
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
  FormTimezoneField: createHost("FormTimezoneField"),
}));
jest.mock("@repo/ui/components/icon", () => ({ Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/loading", () => ({ LoadingButton: createHost("LoadingButton") }));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@repo/ui/hooks", () => ({
  useZodForm: (options: unknown) => {
    mockForm = jest.requireActual("@repo/ui/hooks").useZodForm(options);
    return mockForm;
  },
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
jest.mock("@repo/api/profile-identity-cache", () => ({
  invalidateProfileIdentityQueries: (...args: unknown[]) =>
    mockInvalidateProfileIdentityQueries(...args),
}));
jest.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ profile: mockProfile, refreshProfile: mockRefreshProfile }),
}));
jest.mock("@/lib/calendar/eventSchedule", () => ({ getDeviceTimeZone: () => "America/New_York" }));
jest.mock("@/lib/server-config", () => ({ getReachableSupabaseStorageUrl: (url: string) => url }));
jest.mock("@/lib/stores/theme-store", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
jest.mock("@/lib/utils/formErrors", () => ({ handleSubmitFormError: jest.fn() }));

const ProfileEdit = require("../profile-edit").default;

it("defaults to the device timezone and retains dirty overrides on profile refresh", async () => {
  const rendered = await renderNative(<ProfileEdit />);
  expect(mockForm.getValues("planning_timezone")).toBe("America/New_York");
  await act(async () =>
    mockForm.setValue("planning_timezone", "Asia/Kathmandu", { shouldDirty: true }),
  );
  mockProfile = { ...mockProfile, full_name: "Refreshed name", planning_timezone: "Europe/London" };
  await rendered.rerender(<ProfileEdit />);
  expect(mockForm.getValues("planning_timezone")).toBe("Asia/Kathmandu");
  expect(mockForm.getValues("full_name")).toBe("Refreshed name");
});

it("loads the saved timezone rather than the device default and resets for a new owner", async () => {
  mockProfile = { ...mockProfile, planning_timezone: "Pacific/Auckland" };
  const rendered = await renderNative(<ProfileEdit />);
  expect(mockForm.getValues("planning_timezone")).toBe("Pacific/Auckland");
  await act(async () =>
    mockForm.setValue("planning_timezone", "Asia/Kathmandu", { shouldDirty: true }),
  );
  mockProfile = { ...mockProfile, id: "user-2", planning_timezone: "Europe/London" };
  await rendered.rerender(<ProfileEdit />);
  expect(mockForm.getValues("planning_timezone")).toBe("Europe/London");
});

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
    publicUrl:
      "https://storage.example.com/storage/v1/object/public/profile-avatars/user-1/new-avatar.jpg",
  });
  mockCompareAndSwapMedia.mockResolvedValue({ success: true });
  mockDeleteFile.mockResolvedValue({ success: true });
  mockRefreshProfile.mockResolvedValue(undefined);
  mockInvalidateProfiles.mockResolvedValue(undefined);
  mockInvalidateProfileIdentityQueries.mockResolvedValue(undefined);
  global.fetch = jest.fn().mockResolvedValue({
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(6)),
    ok: true,
    statusText: "OK",
  });
});

it("renders the loaded required full name above username", async () => {
  await renderNative(<ProfileEdit />);

  const fields = screen.container.queryAll(
    (node) => node.type === "FormTextField" || node.type === "FormTimezoneField",
  );
  expect(fields.map((field) => field.props.name)).toEqual([
    "full_name",
    "username",
    "planning_timezone",
  ]);
  expect(fields[0]?.props).toEqual(
    expect.objectContaining({ label: "Full Name *", testId: "profile-edit-full-name" }),
  );
  expect(fields[2]?.type).toBe("FormTimezoneField");
});

it("uploads with the returned path and commits it through profile media CAS", async () => {
  await renderNative(<ProfileEdit />);

  await fireEvent.press(screen.getByTestId("profile-edit-avatar-button"));
  await fireEvent.press(screen.getByTestId("profile-avatar-source-library"));

  await waitFor(() =>
    expect(mockCompareAndSwapMedia).toHaveBeenCalledWith({
      field: "avatar_url",
      expected: null,
      next: "https://storage.example.com/storage/v1/object/public/profile-avatars/user-1/new-avatar.jpg",
    }),
  );
  expect(mockUpdateProfile).not.toHaveBeenCalled();
  expect(mockDeleteFile).not.toHaveBeenCalled();
  expect(mockInvalidateProfileIdentityQueries).toHaveBeenCalledTimes(1);
  expect(global.fetch).toHaveBeenLastCalledWith("https://example.com/signed-upload", {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: expect.any(ArrayBuffer),
  });
});

it("deletes the just-uploaded object when media CAS fails", async () => {
  const originalConsoleError = console.error;
  console.error = jest.fn();
  mockCompareAndSwapMedia.mockRejectedValueOnce(
    Object.assign(new Error("Conflict"), {
      data: { code: "CONFLICT" },
    }),
  );
  await renderNative(<ProfileEdit />);

  await fireEvent.press(screen.getByTestId("profile-edit-avatar-button"));
  await fireEvent.press(screen.getByTestId("profile-avatar-source-library"));

  await waitFor(() =>
    expect(mockDeleteFile).toHaveBeenCalledWith({ filePath: "user-1/new-avatar.jpg" }),
  );
  console.error = originalConsoleError;
});

it("clears with the stored value as expected and deletes only the prior owned path", async () => {
  mockProfile = { ...mockProfile, avatar_url: "user-1/old-avatar.jpg" };
  await renderNative(<ProfileEdit />);

  await fireEvent.press(screen.getByLabelText("Remove profile picture"));

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

it("deletes a prior owned public avatar after clearing it", async () => {
  const publicAvatarUrl =
    "https://storage.example.com/storage/v1/object/public/profile-avatars/user-1/old-avatar.jpg";
  mockProfile = { ...mockProfile, avatar_url: publicAvatarUrl };
  await renderNative(<ProfileEdit />);

  await fireEvent.press(screen.getByLabelText("Remove profile picture"));

  await waitFor(() =>
    expect(mockCompareAndSwapMedia).toHaveBeenCalledWith({
      field: "avatar_url",
      expected: publicAvatarUrl,
      next: null,
    }),
  );
  expect(mockDeleteFile).toHaveBeenCalledWith({ filePath: "user-1/old-avatar.jpg" });
});

it.each([
  "https://cdn.example.com/avatar.jpg",
  "another-user/avatar.jpg",
])("does not delete an unowned prior value after a successful clear: %s", async (unownedValue) => {
  mockProfile = { ...mockProfile, avatar_url: unownedValue };
  await renderNative(<ProfileEdit />);

  await fireEvent.press(screen.getByLabelText("Remove profile picture"));

  await waitFor(() =>
    expect(mockCompareAndSwapMedia).toHaveBeenCalledWith({
      field: "avatar_url",
      expected: unownedValue,
      next: null,
    }),
  );
  expect(mockDeleteFile).not.toHaveBeenCalled();
});
