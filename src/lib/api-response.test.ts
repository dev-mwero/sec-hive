/**
 * API envelope, error mapping and 404-not-403.
 *
 * The control of note: when the target resource is outside the caller's scope, the API must
 * return 404 — not 403 — to avoid creating an existence-enumeration oracle. The unit tests
 * here assert the *mapping* and message invariants in isolation.
 */
import { describe, expect, it, vi } from "vitest";
import { type ZodError, z } from "zod";

import {
  ApiError,
  apiCreated,
  apiError,
  apiFailure,
  apiOk,
  apiSuccess,
  type FieldError,
  withErrorHandling,
} from "@/lib/api-response";

describe("apiSuccess", () => {
  it("returns a plain envelope, not a Response", () => {
    // `apiSuccess` is the *envelope* builder; `apiOk`/`apiCreated` wrap it in a NextResponse.
    // Asserting `.status` here was testing the wrong function — there is no status until a
    // Response wraps it.
    expect(apiSuccess({ id: "shift-1" })).toEqual({
      success: true,
      data: { id: "shift-1" },
    });
  });

  it("carries an optional message and meta without inventing either", () => {
    expect(
      apiSuccess({ id: "shift-1" }, { message: "Created", meta: { page: 1 } }),
    ).toEqual({
      success: true,
      data: { id: "shift-1" },
      message: "Created",
      meta: { page: 1 },
    });
  });
});

describe("apiOk / apiCreated", () => {
  it("wraps the envelope in a 200 Response", async () => {
    const res = apiOk({ id: "shift-1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { id: "shift-1" },
    });
  });

  it("returns 201 and a default message for a created resource", async () => {
    const res = apiCreated({ id: "shift-1" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      success: true,
      data: { id: "shift-1" },
      message: "Created",
    });
  });

  it("passes ResponseInit through so a custom status is honoured", () => {
    expect(apiOk({ id: "shift-1" }, { status: 202 }).status).toBe(202);
  });
});

describe("ApiError", () => {
  it("creates typed errors with the right status", () => {
    expect(ApiError.badRequest("bad").status).toBe(400);
    expect(ApiError.unauthenticated().status).toBe(401);
    expect(ApiError.forbidden().status).toBe(403);
    expect(ApiError.notFound().status).toBe(404);
    expect(ApiError.conflict("CONFLICT", "conflict").status).toBe(409);
    expect(ApiError.rateLimited().status).toBe(429);
  });

  it("attaches field details to validation-like errors", () => {
    const err = ApiError.badRequest("bad", [
      { path: "siteId", message: "required" },
    ]);
    expect(err.details).toEqual([{ path: "siteId", message: "required" }]);
  });
});

describe("apiFailure", () => {
  it("maps ApiError to the standard failure envelope", () => {
    const res = apiFailure(ApiError.notFound("gone"));
    expect(res.status).toBe(404);

    const body = res as unknown as { json: () => Promise<unknown> };
    return body.json().then((value) => {
      expect(value).toEqual({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "gone",
        },
        message: "Request failed",
      });
    });
  });
});

describe("apiError", () => {
  it("passes through ApiError instances unchanged", () => {
    const res = apiError(ApiError.forbidden());
    expect(res.status).toBe(403);
  });

  it("maps ZodError to VALIDATION_ERROR with field details", () => {
    // The error is produced by a real schema rather than hand-forged issue objects. Zod's issue
    // shape differs between v3 and v4 (`received`, `type`, `inclusive` are gone in v4), so a
    // hand-written literal tests this repo's Zod version by accident and fails typecheck on
    // upgrade. Parsing a real failure keeps the test honest across both.
    const schema = z.object({
      siteId: z.string({ error: "Required" }),
      name: z.string().min(1, "Name cannot be empty"),
    });

    const parsed = schema.safeParse({ name: "" });
    expect(parsed.success).toBe(false);
    const zodErr = (parsed as { error: ZodError }).error;

    const res = apiError(zodErr);
    expect(res.status).toBe(422);

    const body = res as unknown as { json: () => Promise<unknown> };
    return body.json().then((value) => {
      expect(value).toMatchObject({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "The submitted data is invalid",
        },
        message: "Request failed",
      });
      const details = (value as { error: { details: FieldError[] } }).error
        .details;
      expect(details.map((detail) => detail.path)).toEqual(["siteId", "name"]);
      expect(details[1].message).toBe("Name cannot be empty");
    });
  });

  it('labels a root-level validation failure as "body"', () => {
    // A top-level schema failure has no field name. Collapsing it to an empty string would put
    // `details[0].path === ""`, which no client can map back onto a form control.
    const parsed = z.string().safeParse(123);
    expect(parsed.success).toBe(false);

    const res = apiError((parsed as { error: ZodError }).error);
    const body = res as unknown as { json: () => Promise<unknown> };
    return body.json().then((value) => {
      const details = (value as { error: { details: FieldError[] } }).error
        .details;
      expect(details[0].path).toBe("body");
    });
  });

  it("returns INTERNAL_ERROR for unknown exceptions and does NOT leak internal details", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = apiError(
      new Error("database connection string is super secret"),
    );
    expect(res.status).toBe(500);

    const body = res as unknown as { json: () => Promise<unknown> };
    return body.json().then((value) => {
      expect(value).toEqual({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred",
        },
        message: "Request failed",
      });
      spy.mockRestore();
    });
  });

  it("treats non-Error throws as internal errors", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = apiError("a string throw");
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});

describe("withErrorHandling", () => {
  it("wraps successful handlers", async () => {
    const handler = async () => apiOk({ ok: true });
    const wrapped = withErrorHandling(handler);
    const res = await wrapped();
    expect(res.status).toBe(200);
  });

  it("catches thrown ApiError and maps it", async () => {
    const handler = async () => {
      throw ApiError.notFound();
    };
    const wrapped = withErrorHandling(handler);
    const res = await wrapped();
    expect(res.status).toBe(404);
  });

  it("catches unexpected throws and maps to 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = async () => {
      throw new Error("boom");
    };
    const wrapped = withErrorHandling(handler);
    const res = await wrapped();
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});

/**
 * 404-not-403: the architecture states that when a resource falls outside the caller's scope, the
 * answer is `ApiError.notFound` (404) rather than `forbidden` (403) to prevent existence leaks.
 * This unit test asserts the helper behaviour directly — if someone ever swaps this, the test
 * fails and forces them to revisit the security rationale in docs/rbac.md#why-404-not-403.
 */
describe("the 404-not-403 invariant", () => {
  it("uses NOT_FOUND for outside-scope resources", () => {
    const err = ApiError.notFound();
    expect(err.status).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("uses FORBIDDEN only for action-denied on a visible resource", () => {
    const err = ApiError.forbidden();
    expect(err.status).toBe(403);
    expect(err.code).toBe("FORBIDDEN");
  });
});
