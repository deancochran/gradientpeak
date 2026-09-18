import type { CreateGroupInput } from "@repo/core/groups";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api/client";
import { useUnsavedChangesGuard } from "../../lib/use-unsaved-changes-guard";
import { MutationError, type WebGroupSummary } from "./group-ui";

type GroupFormProps = {
  group?: WebGroupSummary | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onSuccess?: () => void;
  onSubmit: (value: CreateGroupInput) => Promise<void>;
  submitLabel: string;
};

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

function isImageType(value: string): value is ImageType {
  return IMAGE_TYPES.some((type) => type === value);
}

export function GroupForm({
  group,
  isSubmitting,
  onCancel,
  onSuccess,
  onSubmit,
  submitLabel,
}: GroupFormProps) {
  const uploadMutation = api.storage.createSignedUploadUrl.useMutation();
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [avatarUrl, setAvatarUrl] = useState(group?.avatar_url ?? "");
  const [coverUrl, setCoverUrl] = useState(group?.cover_url ?? "");
  const [accessLevel, setAccessLevel] = useState<"public" | "members_only">(
    group?.access_level ?? "public",
  );
  const [joinPolicy, setJoinPolicy] = useState<"open" | "invite_only">(
    group?.join_policy === "open" ? "open" : "invite_only",
  );
  const [error, setError] = useState<unknown>(null);
  const [uploading, setUploading] = useState<"avatar" | "cover" | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadRetry, setUploadRetry] = useState<Partial<Record<"avatar" | "cover", File>>>({});
  const uploadAttemptRef = useRef(0);
  const uploadInFlightRef = useRef(false);
  const groupId = group?.id;
  const previousGroupIdRef = useRef(groupId);
  const initialValues = useRef({
    accessLevel: group?.access_level ?? "public",
    avatarUrl: group?.avatar_url ?? "",
    coverUrl: group?.cover_url ?? "",
    description: group?.description ?? "",
    joinPolicy: group?.join_policy === "open" ? "open" : "invite_only",
    name: group?.name ?? "",
  });
  const { guardedCancel, markSaved } = useUnsavedChangesGuard({
    draft: { accessLevel, avatarUrl, coverUrl, description, joinPolicy, name },
    dirty:
      name !== initialValues.current.name ||
      description !== initialValues.current.description ||
      avatarUrl !== initialValues.current.avatarUrl ||
      coverUrl !== initialValues.current.coverUrl ||
      accessLevel !== initialValues.current.accessLevel ||
      joinPolicy !== initialValues.current.joinPolicy,
    pending: isSubmitting,
  });
  const hasUploadReview = Boolean(uploadRetry.avatar || uploadRetry.cover);

  useEffect(() => {
    if (previousGroupIdRef.current === groupId) return;

    previousGroupIdRef.current = groupId;
    uploadAttemptRef.current += 1;
    uploadInFlightRef.current = false;
    setUploading(null);
    setUploadError(null);
    setUploadRetry({});
  }, [groupId]);

  const uploadImage = async (kind: "avatar" | "cover", file: File | undefined) => {
    if (!file) return;
    if (!isImageType(file.type)) {
      setError(new Error("Choose a JPEG, PNG, GIF, or WebP image."));
      return;
    }
    if (uploadInFlightRef.current) return;

    const attempt = ++uploadAttemptRef.current;
    uploadInFlightRef.current = true;
    try {
      setUploading(kind);
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const signed = await uploadMutation.mutateAsync({
        fileName: `group-${kind}-${Date.now()}.${extension}`,
        fileType: file.type,
      });
      const response = await fetch(signed.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("Image upload failed.");
      if (attempt !== uploadAttemptRef.current) return;

      if (kind === "avatar") setAvatarUrl(signed.publicUrl);
      else setCoverUrl(signed.publicUrl);
      setUploadError(null);
      setUploadRetry((files) => ({ ...files, [kind]: undefined }));
    } catch (cause) {
      if (attempt === uploadAttemptRef.current) {
        setUploadError(cause instanceof Error ? cause.message : "Image upload failed.");
        setUploadRetry((files) => ({ ...files, [kind]: file }));
      }
    } finally {
      if (attempt === uploadAttemptRef.current) {
        uploadInFlightRef.current = false;
        setUploading(null);
      }
    }
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (uploadInFlightRef.current || hasUploadReview) return;
        setError(null);
        void onSubmit({
          name: name.trim(),
          description: description.trim() || null,
          avatar_url: avatarUrl || null,
          cover_url: coverUrl || null,
          access_level: accessLevel,
          join_policy: joinPolicy,
        })
          .then(() => {
            markSaved();
            onSuccess?.();
          })
          .catch(setError);
      }}
    >
      {coverUrl ? (
        <img
          alt="Group cover preview"
          className="h-48 w-full rounded-xl object-cover"
          src={coverUrl}
        />
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="group-cover">Cover photo</Label>
        <Input
          accept="image/jpeg,image/png,image/gif,image/webp"
          disabled={Boolean(uploading)}
          id="group-cover"
          type="file"
          onChange={(event) => void uploadImage("cover", event.target.files?.[0])}
        />
        {coverUrl ? (
          <Button onClick={() => setCoverUrl("")} type="button" variant="ghost">
            Remove cover
          </Button>
        ) : null}
      </div>
      <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
        <div className="space-y-2">
          {avatarUrl ? (
            <img
              alt="Group avatar preview"
              className="h-24 w-24 rounded-full object-cover"
              src={avatarUrl}
            />
          ) : null}
          <Label htmlFor="group-avatar">Avatar</Label>
          <Input
            accept="image/jpeg,image/png,image/gif,image/webp"
            disabled={Boolean(uploading)}
            id="group-avatar"
            type="file"
            onChange={(event) => void uploadImage("avatar", event.target.files?.[0])}
          />
          {avatarUrl ? (
            <Button onClick={() => setAvatarUrl("")} type="button" variant="ghost">
              Remove avatar
            </Button>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-name">Name</Label>
          <Input
            id="group-name"
            maxLength={120}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="group-description">Description</Label>
        <Textarea
          id="group-description"
          maxLength={2000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium" htmlFor="group-access">
          Access
          <select
            className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3"
            id="group-access"
            value={accessLevel}
            onChange={(event) => setAccessLevel(event.target.value as typeof accessLevel)}
          >
            <option value="public">Public</option>
            <option value="members_only">Members only</option>
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium" htmlFor="group-policy">
          Join policy
          <select
            className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3"
            id="group-policy"
            value={joinPolicy}
            onChange={(event) => setJoinPolicy(event.target.value as typeof joinPolicy)}
          >
            <option value="open">Open join</option>
            <option value="invite_only">Invite or request</option>
          </select>
        </label>
      </div>
      {uploading ? (
        <p aria-live="polite" role="status">
          Uploading {uploading}…
        </p>
      ) : null}
      {uploadError ? (
        <div aria-live="polite" className="flex items-center gap-3" role="alert">
          <p>{uploadError}</p>
          {uploadRetry.avatar ? (
            <Button
              onClick={() => void uploadImage("avatar", uploadRetry.avatar)}
              type="button"
              variant="outline"
            >
              Retry avatar upload
            </Button>
          ) : null}
          {uploadRetry.cover ? (
            <Button
              onClick={() => void uploadImage("cover", uploadRetry.cover)}
              type="button"
              variant="outline"
            >
              Retry cover upload
            </Button>
          ) : null}
          <Button
            onClick={() => {
              setUploadError(null);
              setUploadRetry({});
            }}
            type="button"
            variant="ghost"
          >
            Keep current image
          </Button>
        </div>
      ) : null}
      <MutationError error={error} />
      <div className="flex justify-end gap-3">
        <Button
          disabled={isSubmitting || Boolean(uploading) || hasUploadReview}
          onClick={() => guardedCancel(onCancel)}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button
          disabled={isSubmitting || Boolean(uploading) || hasUploadReview || !name.trim()}
          type="submit"
        >
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
