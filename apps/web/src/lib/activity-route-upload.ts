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
