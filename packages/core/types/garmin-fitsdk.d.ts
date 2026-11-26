declare module "@garmin/fitsdk" {
  export class Encoder {
    constructor();
    writeMesg(message: unknown): void;
    close(): Uint8Array;
  }

  export class Decoder {
    constructor(stream: Stream);
    static isFIT(stream: Stream): boolean;
    checkIntegrity(): boolean;
    read(options?: unknown): {
      messages: Record<string, unknown[]>;
      errors: Array<{ offset?: unknown; message?: unknown }>;
    };
  }

  export interface Stream {}

  export const Stream: {
    fromBuffer(buffer: Buffer): Stream;
    fromByteArray(bytes: number[] | Uint8Array): Stream;
    fromArrayBuffer(buffer: ArrayBuffer): Stream;
  };

  export const Profile: {
    MesgNum: {
      FILE_ID: number;
      DEVICE_INFO: number;
      EVENT: number;
      RECORD: number;
      LAP: number;
      SESSION: number;
      ACTIVITY: number;
      [key: string]: number;
    };
    messages?: Record<string, { messagesKey?: string }>;
    types: Record<string, Record<string, string>> & {
      mesgNum: { [key: number]: string };
    };
  };

  export const Utils: {
    convertDateToDateTime(date: Date): number;
    convertDateTimeToDate(timestamp: number): Date;
  };
}
