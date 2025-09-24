import * as Location from "./location";
import * as Sensors from "./sensors";
import * as Sessions from "./sessions";
import * as Storage from "./storage";
import * as Summary from "./summary";

import { RecordingSession } from "./types";

export class ActivityRecorderService {
  private sessions: Map<string, RecordingSession> = new Map();

  async createActivityRecording(userId: string, activityType: string) {
    return Sessions.createSession(userId, activityType);
  }

  async startSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("Session not found");

    await Permissions.ensureAllRequired();
    await Sensors.start(sessionId);
    await Location.start(sessionId);
    Storage.startChunking(sessionId);

    session.state = RecordingState.ACTIVE;
  }

  async pauseSession(sessionId: string) {
    return Sessions.pause(sessionId);
  }

  async finishSession(sessionId: string) {
    await Sensors.stop(sessionId);
    await Location.stop(sessionId);
    Storage.stopChunking(sessionId);

    return Summary.compute(sessionId);
  }
}
