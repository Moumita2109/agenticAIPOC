export type LogLevel = "debug" | "info" | "warn" | "error";

function format(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const metaStr = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
  return `[${ts}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

export function createLogger(scope: string) {
  const prefix = scope ? `[${scope}] ` : "";
  return {
    debug(message: string, meta?: Record<string, unknown>) {
      console.debug(format("debug", `${prefix}${message}`, meta));
    },
    info(message: string, meta?: Record<string, unknown>) {
      console.info(format("info", `${prefix}${message}`, meta));
    },
    warn(message: string, meta?: Record<string, unknown>) {
      console.warn(format("warn", `${prefix}${message}`, meta));
    },
    error(message: string, meta?: Record<string, unknown>) {
      console.error(format("error", `${prefix}${message}`, meta));
    },
  };
}
