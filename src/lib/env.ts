/**
 * Environment access.
 *
 * Two hard rules:
 *
 * 1. Server-only values are read lazily, never at module scope, so importing this module from
 *    a client bundle cannot inline a secret. Use `serverEnv()` inside server code only.
 * 2. A missing or malformed value throws a short, actionable message. The message is
 *    developer-facing by definition (it only ever surfaces during boot), so it names the
 *    variable and the fix rather than leaking a driver stack trace to a user.
 */

import "server-only";

const REQUIRED = ["MONGODB_URI", "AUTH_SECRET"] as const;

export class MissingEnvError extends Error {
  constructor(name: string, hint: string) {
    super(
      `[sec-hive] Missing or invalid environment variable ${name}. ${hint}\n` +
        `[sec-hive] See .env.example for the full list.`,
    );
    this.name = "MissingEnvError";
  }
}

function read(name: (typeof REQUIRED)[number]): string {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new MissingEnvError(
      name,
      name === "MONGODB_URI"
        ? "Copy .env.example to .env.local and set your Atlas connection string."
        : "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }

  return value;
}

export function mongodbUri(): string {
  const uri = read("MONGODB_URI");

  if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
    throw new MissingEnvError(
      "MONGODB_URI",
      "Value must start with mongodb:// or mongodb+srv://.",
    );
  }

  return uri;
}

export function authSecret(): string {
  const secret = read("AUTH_SECRET");

  if (secret.length < 32) {
    throw new MissingEnvError(
      "AUTH_SECRET",
      "Must be at least 32 characters. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }

  return secret;
}

/** Development-only escape hatch for a local replica set. Never enabled in production. */
export function mongodbTlsInsecure(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.MONGODB_TLS_INSECURE === "true"
  );
}
