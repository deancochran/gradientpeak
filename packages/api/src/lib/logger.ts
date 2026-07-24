import { sanitizeTelemetryContext } from "../telemetry-sanitizer.mjs";

type LogContext = Record<string, unknown>;

const debugEnabled = process.env.API_DEBUG_LOGS === "true";
const MAX_CODE_AUTHORED_LOG_MESSAGE_LENGTH = 160;

function writeLog(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  context?: LogContext,
) {
  if (level === "debug" && !debugEnabled) return;

  const boundedMessage = message.slice(0, MAX_CODE_AUTHORED_LOG_MESSAGE_LENGTH);

  const logger =
    level === "debug"
      ? console.debug
      : level === "info"
        ? console.info
        : level === "warn"
          ? console.warn
          : console.error;

  if (context) {
    logger(boundedMessage, sanitizeTelemetryContext(context));
    return;
  }

  logger(boundedMessage);
}

export const logger = {
  debug(message: string, context?: LogContext) {
    writeLog("debug", message, context);
  },
  info(message: string, context?: LogContext) {
    writeLog("info", message, context);
  },
  warn(message: string, context?: LogContext) {
    writeLog("warn", message, context);
  },
  error(message: string, context?: LogContext) {
    writeLog("error", message, context);
  },
};
