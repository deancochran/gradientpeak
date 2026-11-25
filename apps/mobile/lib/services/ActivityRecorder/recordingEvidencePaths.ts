import { Paths } from "expo-file-system";

const recordingEvidenceIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function requireRecordingEvidenceId(recordingId: string): string {
  if (!recordingEvidenceIdPattern.test(recordingId)) {
    throw new Error("Recording evidence path identity is invalid");
  }
  return recordingId;
}

export function canonicalRecordingEvidenceUris(
  recordingId: string,
  documentUri = Paths.document.uri,
): {
  rootDirectoryUri: string;
  fitDirectoryUri: string;
  activityFileUri: string;
  streamDirectoryUri: string;
} {
  const safeId = requireRecordingEvidenceId(recordingId);
  if (typeof documentUri !== "string" || !documentUri.startsWith("file://")) {
    throw new Error("Recording evidence document directory is unavailable");
  }
  const base = documentUri.endsWith("/") ? documentUri : `${documentUri}/`;
  const rootDirectoryUri = `${base}recording_evidence_${safeId}/`;
  const fitDirectoryUri = `${rootDirectoryUri}fit/`;
  return {
    rootDirectoryUri,
    fitDirectoryUri,
    activityFileUri: `${fitDirectoryUri}activity.fit`,
    streamDirectoryUri: `${rootDirectoryUri}streams/`,
  };
}
