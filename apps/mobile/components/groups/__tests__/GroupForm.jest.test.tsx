import { act, fireEvent, render as renderNative, waitFor } from "@testing-library/react-native";
import { createRef, type ReactNode } from "react";
import { createFormComponentMocks, createHost, createPressableHost } from "@/test/mock-components";
import { GroupForm, type GroupFormHandle } from "../GroupForm";

const createSignedUploadUrl = jest.fn();
const requestMediaLibraryPermissions = jest.fn();
const launchImageLibrary = jest.fn();

jest.mock("expo-file-system", () => ({ File: jest.fn((uri: string) => ({ exists: true, uri })) }));
jest.mock("expo-image-picker", () => ({
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: (...args: unknown[]) => launchImageLibrary(...args),
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) =>
    requestMediaLibraryPermissions(...args),
}));
jest.mock("@/lib/api", () => ({
  api: {
    storage: {
      createSignedUploadUrl: {
        useMutation: () => ({ isPending: false, mutateAsync: createSignedUploadUrl }),
      },
    },
  },
}));
jest.mock("@/lib/server-config", () => ({ getReachableSupabaseStorageUrl: (url: string) => url }));
jest.mock("@/lib/stores/theme-store", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
jest.mock("@repo/tailwindcss/native", () => ({ THEME: { light: { primaryForeground: "white" } } }));
jest.mock("@repo/ui/components/avatar", () => ({
  Avatar: createHost("Avatar"),
  AvatarFallback: createHost("AvatarFallback"),
  AvatarImage: createHost("AvatarImage"),
}));
jest.mock("@repo/ui/components/button", () => ({ Button: createPressableHost("Button") }));
jest.mock("@repo/ui/components/form", () => {
  const React = require("react");
  const { TextInput } = require("react-native");
  const { useController } = require("react-hook-form");
  const FormRenderer = ({ control, label, name }: Record<string, unknown>) => {
    const { field } = useController({ control, name });
    return React.createElement(TextInput, {
      accessibilityLabel: label,
      onChangeText: field.onChange,
      value: field.value ?? "",
    });
  };
  return {
    ...createFormComponentMocks(),
    FormTextField: FormRenderer,
    FormTextareaField: FormRenderer,
  };
});
jest.mock("@repo/ui/components/icon", () => ({ Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/loading", () => ({
  LoadingButton: createPressableHost("LoadingButton"),
}));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@/components/shared/AppSelectionModal", () => ({
  AppSelectionModal: ({ children }: { children: ReactNode }) => children,
}));

const group = (id: string, cover_url: string | null = null) =>
  ({
    access_level: "members_only",
    avatar_url: null,
    cover_url,
    description: "Existing description",
    id,
    join_policy: "invite_only",
    name: "Existing group",
    slug: id,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  }) satisfies NonNullable<Parameters<typeof GroupForm>[0]["group"]>;

function imageSources(node: unknown): unknown[] {
  if (!node || typeof node !== "object") return [];
  const value = node as { children?: unknown; props?: { source?: unknown } };
  const children = Array.isArray(value.children) ? value.children : [value.children];

  return [value.props?.source, ...children.flatMap(imageSources)].filter(Boolean);
}

async function chooseCover(
  rendered: Awaited<ReturnType<typeof renderNative>>,
  uri: string,
  waitForUpload = true,
) {
  launchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri }] });
  const imageButton =
    rendered.queryByLabelText("Add group cover photo") ??
    rendered.getByLabelText("Change group cover photo");
  await act(async () => imageButton.props.onPress());
  const chooseFromLibrary = rendered.getByText("Choose from library").parent?.props.onPress;
  if (!chooseFromLibrary) throw new Error("Missing library source action");

  if (waitForUpload) {
    await act(async () => chooseFromLibrary());
  } else {
    await act(async () => {
      void chooseFromLibrary();
    });
  }
}

describe("GroupForm image recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requestMediaLibraryPermissions.mockResolvedValue({ status: "granted" });
    createSignedUploadUrl.mockResolvedValue({
      publicUrl: "https://images.example.test/cover.jpg",
      signedUrl: "https://uploads.example.test/cover.jpg",
    });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ blob: jest.fn().mockResolvedValue(new Blob(["image"])) })
      .mockResolvedValueOnce({ ok: false, statusText: "Unavailable" });
  });

  it("retains the selected URI and form draft after failure, blocks saving, and retries only once", async () => {
    const submit = jest.fn();
    const ref = createRef<GroupFormHandle>();
    const rendered = await renderNative(
      <GroupForm ref={ref} onSubmit={submit} submitLabel="Create group" />,
    );
    await fireEvent.changeText(rendered.getByLabelText("Name"), "New name");
    await fireEvent.changeText(rendered.getByLabelText("Description"), "New description");

    await chooseCover(rendered, "file:///cover-a.jpg");
    await waitFor(() => expect(rendered.getByText("Upload failed: Unavailable")).toBeTruthy());
    expect(rendered.getByLabelText("Name").props.value).toBe("New name");
    expect(rendered.getByLabelText("Description").props.value).toBe("New description");

    ref.current?.submit();
    expect(submit).not.toHaveBeenCalled();

    let resolveRetry!: (value: { publicUrl: string; signedUrl: string }) => void;
    createSignedUploadUrl.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRetry = resolve;
      }),
    );
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ blob: jest.fn().mockResolvedValue(new Blob(["image"])) })
      .mockResolvedValueOnce({ ok: true, statusText: "OK" });
    await act(async () => {
      rendered.getByText("Retry upload").parent?.props.onPress();
      rendered.getByText("Retry upload").parent?.props.onPress();
      resolveRetry({
        publicUrl: "https://images.example.test/cover-a.jpg",
        signedUrl: "https://uploads.example.test/cover-a.jpg",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(createSignedUploadUrl).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(rendered.queryByText("Upload failed: Unavailable")).toBeNull());
    expect(rendered.getByLabelText("Change group cover photo")).toBeTruthy();
  });

  it("ignores a stale upload completion after the form is reused for another group", async () => {
    let resolveUpload!: (value: { publicUrl: string; signedUrl: string }) => void;
    createSignedUploadUrl.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    const rendered = await renderNative(
      <GroupForm group={group("group-a")} onSubmit={jest.fn()} submitLabel="Save" />,
    );

    await chooseCover(rendered, "file:///cover-a.jpg", false);
    await waitFor(() => expect(createSignedUploadUrl).toHaveBeenCalledTimes(1));
    await rendered.rerender(
      <GroupForm
        group={group("group-b", "https://images.example.test/cover-b.jpg")}
        onSubmit={jest.fn()}
        submitLabel="Save"
      />,
    );
    await act(async () => {
      resolveUpload({
        publicUrl: "https://images.example.test/cover-a.jpg",
        signedUrl: "https://uploads.example.test/cover-a.jpg",
      });
    });

    await waitFor(() => {
      expect(rendered.getByLabelText("Change group cover photo")).toBeTruthy();
      expect(imageSources(rendered.toJSON())).toContainEqual({
        uri: "https://images.example.test/cover-b.jpg",
      });
      expect(imageSources(rendered.toJSON())).not.toContainEqual({
        uri: "https://images.example.test/cover-a.jpg",
      });
    });
  });
});
