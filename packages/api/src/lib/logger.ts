type LogContext = Record<string, unknown>;

const debugEnabled = process.env.API_DEBUG_LOGS === "true";

function writeLog(level: "debug" | "warn" | "error", message: string, context?: LogContext) {
  if (level === "debug" && !debugEnabled) return;

  const logger =
    level === "debug" ? console.debug : level === "warn" ? console.warn : console.error;

  if (context) {
    logger(message, context);
    return;
  }

  logger(message);
}

export const logger = {
  debug(message: string, context?: LogContext) {
    writeLog("debug", message, context);
  },
  warn(message: string, context?: LogContext) {
    writeLog("warn", message, context);
  },
  error(message: string, context?: LogContext) {
    writeLog("error", message, context);
  },
};
