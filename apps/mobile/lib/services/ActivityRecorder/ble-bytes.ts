import { Buffer } from "buffer";

export function decodeBase64ToBytes(base64Value: string): Uint8Array {
  const buffer = Buffer.from(base64Value, "base64");
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

export function toDataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
