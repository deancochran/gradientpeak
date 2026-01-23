declare module "@garmin/fitsdk" {
  export class Encoder {
    constructor();
    writeMesg(message: any): void;
    close(): Uint8Array;
  }

  export class Decoder {
    constructor(stream: Stream);
    static isFIT(stream: Stream): boolean;
    checkIntegrity(): boolean;
    read(options?: any): { messages: any; errors: any[] };
  }

  export class Stream {
    static fromBuffer(buffer: Buffer): Stream;
    static fromByteArray(bytes: number[] | Uint8Array): Stream;
    static fromArrayBuffer(buffer: ArrayBuffer): Stream;
  }

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
    types: {
      mesgNum: { [key: number]: string };
    };
  };

  export const Utils: {
    convertDateToDateTime(date: Date): number;
    convertDateTimeToDate(timestamp: number): Date;
  };
}
