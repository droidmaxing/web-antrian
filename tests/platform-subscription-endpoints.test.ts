import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@/lib/prisma";

test("Platform Subscription Endpoints - trial-reset creates subscription if not exists", async () => {
  const biz = await prisma.business.create({
    data: { name: `Test Biz ${Date.now()}`, slug: `test-${Date.now()}` },
  });

  const now = new Date();
  const trialEnds = new Date(now);
  trialEnds.setDate(trialEnds.getDate() + 30);

  const result = await prisma.subscription.upsert({
    where: { businessId: biz.id },
    update: {
      status: "TRIAL",
      trialEndsAt: trialEnds,
      currentPeriodEnd: trialEnds,
    },
    create: {
      businessId: biz.id,
      status: "TRIAL",
      trialEndsAt: trialEnds,
      currentPeriodEnd: trialEnds,
    },
  });

  assert.equal(result.businessId, biz.id);
  assert.equal(result.status, "TRIAL");
  assert(result.trialEndsAt && result.trialEndsAt.getTime() > now.getTime());

  await prisma.subscription.delete({ where: { id: result.id } });
  await prisma.business.delete({ where: { id: biz.id } });
});

test("Platform Subscription Endpoints - trial-reset updates existing subscription", async () => {
  const biz = await prisma.business.create({
    data: { name: `Test Biz ${Date.now()}`, slug: `test-${Date.now()}` },
  });

  const sub = await prisma.subscription.create({
    data: {
      businessId: biz.id,
      status: "ACTIVE",
      currentPeriodEnd: new Date("2026-01-01"),
    },
  });

  const now = new Date();
  const trialEnds = new Date(now);
  trialEnds.setDate(trialEnds.getDate() + 30);

  const result = await prisma.subscription.upsert({
    where: { businessId: biz.id },
    update: {
      status: "TRIAL",
      trialEndsAt: trialEnds,
      currentPeriodEnd: trialEnds,
    },
    create: { businessId: biz.id },
  });

  assert.equal(result.id, sub.id);
  assert.equal(result.status, "TRIAL");

  await prisma.subscription.delete({ where: { id: sub.id } });
  await prisma.business.delete({ where: { id: biz.id } });
});

test("Platform Subscription Endpoints - assign-plan creates subscription if not exists", async () => {
  const biz = await prisma.business.create({
    data: { name: `Test Biz ${Date.now()}`, slug: `test-${Date.now()}` },
  });

  const plan = await prisma.plan.create({
    data: { code: `TEST-${Date.now()}`, name: `Test Plan ${Date.now()}` },
  });

  const result = await prisma.subscription.upsert({
    where: { businessId: biz.id },
    update: { planId: plan.id },
    create: { businessId: biz.id, planId: plan.id },
    include: { plan: true },
  });

  assert.equal(result.businessId, biz.id);
  assert.equal(result.planId, plan.id);
  assert.equal(result.plan?.name, plan.name);

  await prisma.subscription.delete({ where: { id: result.id } });
  await prisma.plan.delete({ where: { id: plan.id } });
  await prisma.business.delete({ where: { id: biz.id } });
});
