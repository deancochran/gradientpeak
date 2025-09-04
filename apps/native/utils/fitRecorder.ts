// utils/fitRecorder.ts
import { Encoder, Profile } from "@garmin/fitsdk";

export type FitRecordPoint = {
  timestamp: Date;
  heartRate?: number;
  power?: number;
  cadence?: number;
  speed?: number; // meters per second
};

export const createFitFile = (records: FitRecordPoint[]): Uint8Array => {
  const encoder = new Encoder();

  // File Header / Metadata
  encoder.onMesg(Profile.MesgNum.FILE_ID, {
    manufacturer: "development",
    product: 1,
    timeCreated: new Date(),
    type: "activity",
  });

  // Encode each record
  for (const record of records) {
    encoder.writeMesg({
      mesgNum: Profile.MesgNum.RECORD,
      timestamp: record.timestamp,
      heartRate: record.heartRate,
      power: record.power,
      cadence: record.cadence,
      speed: record.speed,
    });
  }

  // Close and get the FIT file as Uint8Array
  return encoder.close();
};
