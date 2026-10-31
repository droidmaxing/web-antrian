import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../src/lib/prisma";
import { resetSubscriptionTrial, assignSubscriptionPlan } from "../src/modules/platform/platform-service";
import { readMidtransMode, saveMidtransMode } from "../src/modules/billing/midtrans-settings";

// Cleanup helper
async function cleanupTest(businessId: string) {
  await prisma.auditLog.deleteMany({ where: { businessId } });
}

test("Midtrans mode toggle: save and retrieve mode", async () => {
  // Save production mode
  const mode1 = await saveMidtransMode("production");
  assert.equal(mode1, "production");

  // Verify persistence
  const retrieved1 = await readMidtransMode();
  assert.equal(retrieved1, "production");

  // Toggle back to sandbox
  const mode2 = await saveMidtransMode("sandbox");
  assert.equal(mode2, "sandbox");

  const retrieved2 = await readMidtransMode();
  assert.equal(retrieved2, "sandbox");
});

test("Trial reset: sets status to TRIAL and extends trialEndsAt by 30 days", async () => {
  // Create a user to act as admin
  const admin = await prisma.user.create({
    data: {
      email: `admin-${Date.now()}@test.local`,
      name: "Test Admin",
      passwordHash: "dummy",
      platformRole: "MASTER_ADMIN",
    },
  });

  // Create a business with subscription in ACTIVE state
  const business = await prisma.business.create({
    data: {
      name: "Test Trial Business",
      slug: `test-trial-${Date.now()}`,
    },
  });

  const subscription = await prisma.subscription.create({
    data: {
      businessId: business.id,
      status: "ACTIVE",
      currentPeriodEnd: new Date("2024-01-01"),
      trialEndsAt: null,
    },
  });

  const before = new Date();

  // Reset trial
  const result = await resetSubscriptionTrial(business.id, admin.id);

  const after = new Date();

  // Verify status changed to TRIAL
  assert.equal(result.status, "TRIAL");

  // Verify trialEndsAt is ~30 days from now
  assert(result.trialEndsAt);
  const trialDate = new Date(result.trialEndsAt);
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const expectedMin = new Date(before.getTime() + thirtyDaysMs);
  const expectedMax = new Date(after.getTime() + thirtyDaysMs + 1000);

  assert(trialDate >= expectedMin, `Trial date ${trialDate} should be >= ${expectedMin}`);
  assert(trialDate <= expectedMax, `Trial date ${trialDate} should be <= ${expectedMax}`);

  // Verify currentPeriodEnd was cleared
  const updated = await prisma.subscription.findUnique({
    where: { businessId: business.id },
    select: { currentPeriodEnd: true },
  });
  assert.equal(updated?.currentPeriodEnd, null);

  // Cleanup
  await cleanupTest(business.id);
  await prisma.subscription.delete({ where: { businessId: business.id } });
  await prisma.business.delete({ where: { id: business.id } });
  await prisma.user.delete({ where: { id: admin.id } });
});

test("Plan reassignment: assign active plan to subscription", async () => {
  // Create a user to act as admin
  const admin = await prisma.user.create({
    data: {
      email: `admin-plan-${Date.now()}@test.local`,
      name: "Test Admin Plan",
      passwordHash: "dummy",
      platformRole: "MASTER_ADMIN",
    },
  });

  // Create business and plan
  const business = await prisma.business.create({
    data: {
      name: "Test Plan Business",
      slug: `test-plan-${Date.now()}`,
    },
  });

  const plan = await prisma.plan.create({
    data: {
      code: `TESTPLAN-${Date.now()}`,
      name: "Test Plan",
      active: true,
    },
  });

  const subscription = await prisma.subscription.create({
    data: {
      businessId: business.id,
      status: "TRIAL",
      planId: null,
    },
  });

  // Assign plan
  const result = await assignSubscriptionPlan(business.id, { planId: plan.id }, admin.id);

  assert.equal(result.planId, plan.id);
  assert.equal(result.plan?.id, plan.id);
  assert.equal(result.plan?.code, plan.code);

  // Verify persistence
  const updated = await prisma.subscription.findUnique({
    where: { businessId: business.id },
    select: { planId: true },
  });
  assert.equal(updated?.planId, plan.id);

  // Cleanup
  await cleanupTest(business.id);
  await prisma.subscription.delete({ where: { businessId: business.id } });
  await prisma.plan.delete({ where: { id: plan.id } });
  await prisma.business.delete({ where: { id: business.id } });
  await prisma.user.delete({ where: { id: admin.id } });
});

test("Plan reassignment: clear plan by setting to null", async () => {
  // Create a user to act as admin
  const admin = await prisma.user.create({
    data: {
      email: `admin-clear-${Date.now()}@test.local`,
      name: "Test Admin Clear",
      passwordHash: "dummy",
      platformRole: "MASTER_ADMIN",
    },
  });

  // Create business and plan
  const business = await prisma.business.create({
    data: {
      name: "Test Clear Plan Business",
      slug: `test-clear-${Date.now()}`,
    },
  });

  const plan = await prisma.plan.create({
    data: {
      code: `TESTCLEAR-${Date.now()}`,
      name: "Test Clear",
      active: true,
    },
  });

  const subscription = await prisma.subscription.create({
    data: {
      businessId: business.id,
      status: "TRIAL",
      planId: plan.id,
    },
  });

  // Clear plan
  const result = await assignSubscriptionPlan(business.id, { planId: null }, admin.id);

  assert.equal(result.planId, null);

  // Verify persistence
  const updated = await prisma.subscription.findUnique({
    where: { businessId: business.id },
    select: { planId: true },
  });
  assert.equal(updated?.planId, null);

  // Cleanup
  await cleanupTest(business.id);
  await prisma.subscription.delete({ where: { businessId: business.id } });
  await prisma.plan.delete({ where: { id: plan.id } });
  await prisma.business.delete({ where: { id: business.id } });
  await prisma.user.delete({ where: { id: admin.id } });
});

test("Plan reassignment: throws if business not found", async () => {
  const admin = await prisma.user.create({
    data: {
      email: `admin-err-${Date.now()}@test.local`,
      name: "Test Admin Err",
      passwordHash: "dummy",
      platformRole: "MASTER_ADMIN",
    },
  });

  const fakeId = "nonexistent-business-id";
  try {
    await assignSubscriptionPlan(fakeId, { planId: null }, admin.id);
    assert.fail("Should have thrown");
  } catch (error: unknown) {
    const err = error as Error;
    assert.match(err.message, /Langganan tidak ditemukan/);
  }

  await prisma.user.delete({ where: { id: admin.id } });
});

test("Trial reset: throws if business not found", async () => {
  const admin = await prisma.user.create({
    data: {
      email: `admin-err2-${Date.now()}@test.local`,
      name: "Test Admin Err 2",
      passwordHash: "dummy",
      platformRole: "MASTER_ADMIN",
    },
  });

  const fakeId = "nonexistent-trial-business-id";
  try {
    await resetSubscriptionTrial(fakeId, admin.id);
    assert.fail("Should have thrown");
  } catch (error: unknown) {
    const err = error as Error;
    assert.match(err.message, /Langganan tidak ditemukan/);
  }

  await prisma.user.delete({ where: { id: admin.id } });
});
