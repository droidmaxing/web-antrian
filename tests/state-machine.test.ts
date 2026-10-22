import assert from "node:assert/strict";
import test from "node:test";
import { assertQueueTransition, statusAfterAction } from "../src/modules/queue/domain/state-machine";
import { AppError } from "../src/modules/shared/errors";
import { requireRole, type BusinessContext } from "../src/modules/tenancy/context";

test("queue actions enforce the allowed state transitions", () => {
  assert.equal(statusAfterAction("call", "WAITING"), "CALLED");
  assert.equal(statusAfterAction("recall", "CALLED"), "CALLED");
  assert.equal(statusAfterAction("start", "CALLED"), "SERVING");
  assert.equal(statusAfterAction("complete", "SERVING"), "COMPLETED");
  assert.equal(statusAfterAction("skip", "WAITING"), "SKIPPED");
  assert.equal(statusAfterAction("no-show", "CALLED"), "NO_SHOW");
  assert.equal(statusAfterAction("return-to-waiting", "CALLED"), "WAITING");
  assert.equal(statusAfterAction("cancel", "WAITING"), "CANCELLED");
  assert.equal(statusAfterAction("cancel", "CALLED"), "CANCELLED");
});

test("terminal queues cannot transition back into service", () => {
  for (const status of ["COMPLETED", "SKIPPED", "CANCELLED", "NO_SHOW"] as const) {
    assert.throws(
      () => assertQueueTransition("call", status),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "INVALID_QUEUE_TRANSITION" &&
        error.status === 409,
    );
  }
});

test("owner role outranks admin, and admin cannot change business configuration", () => {
  const owner: BusinessContext = {
    userId: "owner-user",
    businessId: "business-a",
    businessSlug: "business-a",
    role: "OWNER",
    branchIds: null,
    counterIds: null,
  };
  const admin: BusinessContext = {
    ...owner,
    role: "ADMIN",
    branchIds: ["branch-a"],
  };

  // The owner owns the workspace, so every role requirement is satisfied —
  // otherwise the management UI would be read-only for them.
  assert.doesNotThrow(() => requireRole(owner, ["ADMIN", "SUPER_ADMIN"]));
  assert.doesNotThrow(() => requireRole(owner, ["SUPER_ADMIN"]));
  assert.doesNotThrow(() => requireRole(owner, ["ADMIN"]));
  assert.doesNotThrow(() => requireRole(owner, ["OWNER"]));

  assert.throws(
    () => requireRole(admin, ["SUPER_ADMIN"]),
    (error: unknown) => error instanceof AppError && error.status === 403,
  );
  assert.doesNotThrow(() => requireRole(admin, ["ADMIN", "SUPER_ADMIN"]));
});
