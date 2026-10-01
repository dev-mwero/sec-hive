import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Unit tests for the security-critical pure logic.
 *
 * Node environment, not jsdom: everything under `src/lib` that is worth testing is pure
 * arithmetic and matrix lookup. Adding a DOM would cost startup time on every run and buy nothing
 * for these suites. Component rendering tests would need jsdom and are a separate decision.
 *
 * Coverage is deliberately narrow and pointed at the layers where a mistake is a data leak
 * rather than a wrong pixel:
 *
 * - `lib/permissions.ts` — the capability matrix
 * - `lib/tenant.ts` — scope resolution and the filters it produces
 * - `lib/time.ts` — overnight shifts and overlap detection
 * - `lib/api-response.ts` — 404-not-403, and not leaking internal errors
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Pinned so a suite that does compare against a clock cannot pass on one machine and fail on
    // another. Nothing here asserts on today's date, but shift arithmetic is exactly the kind of
    // code that grows a date-dependent assertion later, and a fixed zone makes that safe.
    env: { TZ: "UTC" },
    reporters: "default",
  },
});
