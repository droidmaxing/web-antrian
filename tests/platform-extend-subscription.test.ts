import assert from "node:assert/strict";
import test from "node:test";
import { extendSubscriptionPeriod } from "../src/modules/platform/platform-service";
import { prisma } from "../src/lib/prisma";

test("extend subscription adds months to currentPeriodEnd and sets status to ACTIVE", async () => {
  // Create test admin user
  const admin = await prisma.user.create({
    data: {
      email: `admin-extend-${Date.now()}@test.local`,
      name: "Test Admin Extend",
      passwordHash: "dummy",
      platformRole: "MASTER_ADMIN",
    },
  });

  // Create test business and subscription
  const slug = `test-co-${Date.now()}`;
  const business = await prisma.business.create({
    data: { name: "Test Co", slug },
  });

  const baseDate = new Date("2026-02-15T10:30:00.000Z");
  const subscription = await prisma.subscription.create({
    data: {
      businessId: business.id,
      status: "ACTIVE",
      cycle: "MONTHLY",
      currentPeriodEnd: baseDate,
    },
  });

  // Extend by 3 months
  const result = await extendSubscriptionPeriod(business.id, { months: 3 }, admin.id);

  assert.equal(result.status, "ACTIVE");
  assert.equal(result.cycle, "MONTHLY");
  // 2026-02-15 + 3 months = 2026-05-15
  assert.equal(result.currentPeriodEnd?.toISOString(), "2026-05-15T10:30:00.000Z");

  // Cleanup (delete audit first)
  await prisma.auditLog.deleteMany({ where: { businessId: business.id } });
  await prisma.subscription.delete({ where: { businessId: business.id } });
  await prisma.business.delete({ where: { id: business.id } });
  await prisma.user.delete({ where: { id: admin.id } });
});

test("extend subscription throws when business subscription not found", async () => {
  const admin = await prisma.user.create({
    data: {
      email: `admin-extend-err-${Date.now()}@test.local`,
      name: "Test Admin Extend Err",
      passwordHash: "dummy",
      platformRole: "MASTER_ADMIN",
    },
  });

  try {
    await extendSubscriptionPeriod("nonexistent-business-id", { months: 1 }, admin.id);
    assert.fail("Should have thrown");
  } catch (error) {
    assert.match(String(error), /Langganan tidak ditemukan/);
  }

  await prisma.user.delete({ where: { id: admin.id } });
});

test("extend subscription handles edge case: February to May crossing month boundaries", async () => {
  const admin = await prisma.user.create({
    data: {
      email: `admin-extend-edge-${Date.now()}@test.local`,
      name: "Test Admin Extend Edge",
      passwordHash: "dummy",
      platformRole: "MASTER_ADMIN",
    },
  });

  const slug = `edge-case-co-${Date.now()}`;
  const business = await prisma.business.create({
    data: { name: "Edge Case Co", slug },
  });

  const baseDate = new Date("2026-01-31T00:00:00.000Z");
  const subscription = await prisma.subscription.create({
    data: {
      businessId: business.id,
      status: "TRIAL",
      cycle: "MONTHLY",
      currentPeriodEnd: baseDate,
    },
  });

  // Extend by 1 month: Jan 31 + 1 month = Feb 28 (2026 is not a leap year)
  const result = await extendSubscriptionPeriod(business.id, { months: 1 }, admin.id);

  // JavaScript's setUTCMonth handles Feb 31 → Feb 28 automatically
  assert.equal(result.currentPeriodEnd?.getUTCDate(), 28);
  assert.equal(result.currentPeriodEnd?.getUTCMonth(), 1); // Feb = month 1

  // Cleanup (delete audit first)
  await prisma.auditLog.deleteMany({ where: { businessId: business.id } });
  await prisma.subscription.delete({ where: { businessId: business.id } });
  await prisma.business.delete({ where: { id: business.id } });
  await prisma.user.delete({ where: { id: admin.id } });
});
