/**
 * Server-side logging.
 *
 * The one boundary between "developer needs detail" and "user must not see it". Everything
 * logged here goes to the server console only — no response ever embeds these values
 * (docs/security.md section 10).
 *
 * Deliberately dependency-free: adding a third-party error reporter would create a data
 * egress surface for live security-operations data, which is not acceptable for this product
 * (docs/security.md section 14).
 */

type Level = "info" | "warn" | "error" | "debug";

const isDev = process.env.NODE_ENV !== "production";

function emit(level: Level, message: string, context?: unknown) {
  if (level === "debug" && !isDev) {
    return;
  }

  const method = level === "error" ? console.error : console.log;
  const prefix = `[sechive:${level}]`;

  if (context === undefined) {
    method(prefix, message);
  } else {
    method(prefix, message, context);
  }
}

export const log = {
  info: (message: string, context?: unknown) => emit("info", message, context),
  warn: (message: string, context?: unknown) => emit("warn", message, context),
  error: (message: string, context?: unknown) =>
    emit("error", message, context),
  debug: (message: string, context?: unknown) =>
    emit("debug", message, context),
};
