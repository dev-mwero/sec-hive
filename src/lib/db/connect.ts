/**
 * Mongoose connection singleton.
 *
 * Serverless calls each invocation a cold start, and a naive `mongoose.connect()` per request
 * exhausts the Atlas connection pool. The promise is cached on `globalThis` so warm lambdas
 * reuse exactly one pool for the lifetime of the container.
 *
 * Next.js also runs `next dev`'s HMR in a module graph that re-evaluates modules on change,
 * which would otherwise drop the connection on every save. The `globalThis` cache is what
 * makes development stable as well as production.
 */

import "server-only";

import mongoose from "mongoose";
import { mongodbTlsInsecure, mongodbUri } from "@/lib/env";

/** Fail fast instead of letting the driver hang for 30s inside a user's request. */
const CONNECT_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 45_000;

type MongooseCache = {
  connection: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalForMongoose = globalThis as typeof globalThis & {
  __sechiveMongoose?: MongooseCache;
};

const cache: MongooseCache = globalForMongoose.__sechiveMongoose ?? {
  connection: null,
  promise: null,
};

globalForMongoose.__sechiveMongoose = cache;

export async function connectDb(): Promise<typeof mongoose> {
  if (cache.connection) {
    return cache.connection;
  }

  cache.promise ??= mongoose
    .connect(mongodbUri(), {
      bufferCommands: false,
      serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
      socketTimeoutMS: SOCKET_TIMEOUT_MS,
      maxPoolSize: 10,
      minPoolSize: 0,
      tls: mongodbTlsInsecure() ? false : undefined,
      tlsInsecure: mongodbTlsInsecure() || undefined,
    })
    .then((m) => m)
    .catch((error: unknown) => {
      // Clear the rejected promise so the next request retries instead of re-serving the
      // same cached failure for the lifetime of the container.
      cache.promise = null;
      throw error;
    });

  cache.connection = await cache.promise;

  return cache.connection;
}

export async function disconnectDb(): Promise<void> {
  cache.promise = null;
  cache.connection = null;
  await mongoose.disconnect();
}

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
