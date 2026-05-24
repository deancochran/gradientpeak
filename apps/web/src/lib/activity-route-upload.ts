export type SelectedUploadFile = {
  file: File;
  name: string;
  size: number;
};

export function getSingleFileSelection(
  files:
    | Array<{ file?: File; name: string; size?: number | null; type?: string | null }>
    | undefined,
) {
  const file = files?.[0]?.file;

  if (!file) {
    return null;
  }

  return {
    file,
    name: file.name,
    size: file.size,
  } satisfies SelectedUploadFile;
}

export function formatFileSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function readTextFile(file: File) {
  return file.text();
}

export async function uploadFileToSignedUrl(file: File, signedUrl: string) {
  const response = await fetch(signedUrl, {
    method: "PUT",
    body: file,
    headers: {
      "content-type": file.type || "application/octet-stream",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to upload file to storage.");
  }
}
