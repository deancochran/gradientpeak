import AsyncStorage from "@react-native-async-storage/async-storage";
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from "expo-crypto";

const ROUTE_UPLOAD_OPERATION_PREFIX = "gradientpeak:route-upload:v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function claimRouteUploadOperation(input: {
  description: string | null;
  fileContent: string;
  fileName: string;
  name: string;
  profileId: string;
}) {
  const fingerprint = await digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    JSON.stringify([
      input.profileId,
      input.fileName,
      input.name,
      input.description,
      input.fileContent,
    ]),
  );
  const storageKey = `${ROUTE_UPLOAD_OPERATION_PREFIX}:${input.profileId}:${fingerprint}`;
  const stored = await AsyncStorage.getItem(storageKey);
  const idempotencyKey = stored && UUID_PATTERN.test(stored) ? stored : randomUUID();
  await AsyncStorage.setItem(storageKey, idempotencyKey);
  return { idempotencyKey, storageKey };
}

export async function clearRouteUploadOperation(storageKey: string) {
  await AsyncStorage.removeItem(storageKey);
}
