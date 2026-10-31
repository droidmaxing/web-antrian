import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceSubscriptionPeriod,
  buildOrderId,
  isSubscriptionAllowed,
  midtransSignature,
  parseGrossAmount,
  paymentStatusFromNotification,
  verifyMidtransSignature,
} from "../src/modules/billing/billing-domain";

test("trial and active subscriptions are usable only before their end date", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(isSubscriptionAllowed("TRIAL", new Date("2026-01-02T00:00:00.000Z"), now), true);
  assert.equal(isSubscriptionAllowed("ACTIVE", null, now), true);
  assert.equal(isSubscriptionAllowed("TRIAL", now, now), false);
  assert.equal(isSubscriptionAllowed("EXPIRED", null, now), false);
  assert.equal(isSubscriptionAllowed("SUSPENDED", null, now), false);
});

test("monthly and yearly renewal start at the later of now and current period end", () => {
  const current = new Date("2026-01-31T12:00:00.000Z");
  assert.equal(
    advanceSubscriptionPeriod(current, "MONTHLY", current).toISOString(),
    "2026-02-28T12:00:00.000Z",
  );
  assert.equal(
    advanceSubscriptionPeriod(new Date("2025-01-01T00:00:00.000Z"), "YEARLY", current).toISOString(),
    "2027-01-31T12:00:00.000Z",
  );
});

test("Midtrans notification signatures are compared without timing leaks", () => {
  const key = "test-server-key";
  const signature = midtransSignature("ORDER-123", "200", "125000.00", key);
  assert.equal(verifyMidtransSignature("ORDER-123", "200", "125000.00", key, signature), true);
  assert.equal(verifyMidtransSignature("ORDER-123", "201", "125000.00", key, signature), false);
  assert.equal(verifyMidtransSignature("ORDER-123", "200", "125000.00", key, ""), false);
});

test("Midtrans amounts reject fractional rupiah and malformed values", () => {
  assert.equal(parseGrossAmount("125000.00"), 125000);
  assert.equal(parseGrossAmount("125000.50"), null);
  assert.equal(parseGrossAmount(-1), null);
  assert.equal(parseGrossAmount("1e3"), null);
});

test("only settled or accepted captured transactions are paid", () => {
  assert.equal(paymentStatusFromNotification("settlement", undefined), "PAID");
  assert.equal(paymentStatusFromNotification("capture", "accept"), "PAID");
  assert.equal(paymentStatusFromNotification("capture", "challenge"), "PENDING");
  assert.equal(paymentStatusFromNotification("expire", undefined), "EXPIRED");
});

test("order ids are bounded and unique per call", () => {
  const now = new Date("2026-01-31T12:34:56.000Z");
  const first = buildOrderId("business-1", now);
  const second = buildOrderId("business-1", now);
  assert.ok(first.length <= 50);
  assert.notEqual(first, second);
});
