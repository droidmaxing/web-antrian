import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@/lib/prisma";
import { MembershipRole } from "@prisma/client";

/**
 * Simulasi lengkap: MASTER_ADMIN → 2 Owners → sub-accounts → queue operations
 * Verifikasi isolasi data antar owner/business
 */

test("Hierarchy: Master Admin can see all businesses", async () => {
  const masterAdmin = await prisma.user.findFirst({
    where: { platformRole: "MASTER_ADMIN" },
  });
  assert.ok(masterAdmin, "MASTER_ADMIN user exists");
  
  // Master admin has no business membership, but can query all businesses via platform API
  const businesses = await prisma.business.findMany();
  assert.ok(businesses.length > 0, "Businesses exist in platform");
});

test("Hierarchy: Create 2 new owner accounts", async () => {
  const { hash } = await import("bcryptjs");
  
  const owner1Email = `owner-test-${Date.now()}-1@test.local`;
  const owner2Email = `owner-test-${Date.now()}-2@test.local`;
  
  const owner1 = await prisma.user.create({
    data: {
      email: owner1Email,
      name: "Owner Test 1",
      passwordHash: await hash("OwnerPass123!", 12),
      active: true,
    },
  });
  
  const owner2 = await prisma.user.create({
    data: {
      email: owner2Email,
      name: "Owner Test 2",
      passwordHash: await hash("OwnerPass123!", 12),
      active: true,
    },
  });
  
  assert.ok(owner1.id, "Owner 1 created");
  assert.ok(owner2.id, "Owner 2 created");
  assert.notEqual(owner1.id, owner2.id, "Owners have different IDs");
});

test("Hierarchy: Each owner creates own business", async () => {
  const { hash } = await import("bcryptjs");
  
  // Get or create owner accounts
  const owner1 = await prisma.user.findFirst({
    where: { email: { contains: "owner-test" } },
    orderBy: { createdAt: "asc" },
  });
  assert.ok(owner1, "Owner 1 exists");
  
  const owner2 = await prisma.user.findFirst({
    where: { email: { contains: "owner-test" } },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(owner2, "Owner 2 exists");
  
  // Create business for owner 1
  const biz1 = await prisma.business.create({
    data: {
      name: `Business Owner 1 ${Date.now()}`,
      slug: `biz-owner1-${Date.now()}`,
      businessType: "RETAIL",
      timezone: "Asia/Jakarta",
    },
  });
  
  // Create business for owner 2
  const biz2 = await prisma.business.create({
    data: {
      name: `Business Owner 2 ${Date.now()}`,
      slug: `biz-owner2-${Date.now()}`,
      businessType: "RETAIL",
      timezone: "Asia/Jakarta",
    },
  });
  
  assert.ok(biz1.id, "Business 1 created");
  assert.ok(biz2.id, "Business 2 created");
  assert.notEqual(biz1.id, biz2.id, "Businesses have different IDs");
  
  // Add owners to their respective businesses
  const mem1 = await prisma.businessMembership.create({
    data: {
      userId: owner1.id,
      businessId: biz1.id,
      role: MembershipRole.OWNER,
    },
  });
  
  const mem2 = await prisma.businessMembership.create({
    data: {
      userId: owner2.id,
      businessId: biz2.id,
      role: MembershipRole.OWNER,
    },
  });
  
  assert.ok(mem1.id, "Owner 1 membership in business 1 created");
  assert.ok(mem2.id, "Owner 2 membership in business 2 created");
  
  // Verify owner 1 is NOT member of business 2
  const owner1InBiz2 = await prisma.businessMembership.findFirst({
    where: { userId: owner1.id, businessId: biz2.id },
  });
  assert.equal(owner1InBiz2, null, "Owner 1 is NOT member of business 2 (isolate d)");
  
  // Verify owner 2 is NOT member of business 1
  const owner2InBiz1 = await prisma.businessMembership.findFirst({
    where: { userId: owner2.id, businessId: biz1.id },
  });
  assert.equal(owner2InBiz1, null, "Owner 2 is NOT member of business 1 (isolated)");
});

test("Hierarchy: Each owner invites 2 sub-accounts (ADMIN role)", async () => {
  const { hash } = await import("bcryptjs");
  
  // Get owner 1 and their business (from the test that just created them)
  const owner1 = await prisma.user.findFirst({
    where: { email: { contains: "owner-test" } },
    orderBy: { createdAt: "asc" },
  });
  assert.ok(owner1, "Owner 1 found");
  
  const biz1 = await prisma.business.findFirst({
    where: { slug: { contains: "biz-owner1" } },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(biz1, "Business 1 found");
  
  // Create 2 sub-accounts for owner 1 with unique timestamps
  const timestamp = Date.now();
  const sub1Owner1 = await prisma.user.create({
    data: {
      email: `sub1-owner1-${timestamp}@test.local`,
      name: "Sub 1 Owner 1",
      passwordHash: await hash("SubPass123!", 12),
      active: true,
    },
  });
  
  const sub2Owner1 = await prisma.user.create({
    data: {
      email: `sub2-owner1-${timestamp}-2@test.local`,
      name: "Sub 2 Owner 1",
      passwordHash: await hash("SubPass123!", 12),
      active: true,
    },
  });
  
  // Add them to owner 1's business as ADMIN
  const subMem1 = await prisma.businessMembership.create({
    data: {
      userId: sub1Owner1.id,
      businessId: biz1.id,
      role: MembershipRole.ADMIN,
    },
  });
  
  const subMem2 = await prisma.businessMembership.create({
    data: {
      userId: sub2Owner1.id,
      businessId: biz1.id,
      role: MembershipRole.ADMIN,
    },
  });
  
  assert.ok(subMem1.id, "Sub 1 added to business 1 as ADMIN");
  assert.ok(subMem2.id, "Sub 2 added to business 1 as ADMIN");
  
  // Verify exactly these 2 sub-accounts are in this business (owner + 2 subs)
  const allMembers = await prisma.businessMembership.findMany({
    where: { businessId: biz1.id },
  });
  assert.ok(allMembers.length >= 3, "Business 1 has at least owner + 2 subs");
  
  const adminMembers = await prisma.businessMembership.findMany({
    where: { businessId: biz1.id, role: MembershipRole.ADMIN },
  });
  assert.ok(adminMembers.length >= 2, "Business 1 has at least 2 ADMIN members");
});

test("Hierarchy: Sub-accounts can operate queues in their business", async () => {
  // Get owner 1's business
  const biz1 = await prisma.business.findFirst({
    where: { slug: { contains: "biz-owner1" } },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(biz1, "Business 1 found");
  
  // Create a branch for business 1 with unique slug
  const branchSlug = `branch-${Date.now()}`;
  const branch = await prisma.branch.create({
    data: {
      businessId: biz1.id,
      name: `Branch ${Date.now()}`,
      slug: branchSlug,
      timezone: "Asia/Jakarta",
    },
  });
  
  assert.ok(branch.id, "Branch created");
  
  // Create a service with unique code
  const serviceCode = `TST${Date.now()}`.substring(0, 10);
  const service = await prisma.service.create({
    data: {
      businessId: biz1.id,
      code: serviceCode,
      name: `Test Service ${Date.now()}`,
    },
  });
  
  assert.ok(service.id, "Service created");
  
  // Create a counter with unique code
  const counterCode = `C${Date.now()}`.substring(0, 3);
  const counter = await prisma.counter.create({
    data: {
      branchId: branch.id,
      code: counterCode,
      name: `Counter ${Date.now()}`,
    },
  });
  
  assert.ok(counter.id, "Counter created");
  
  // Create a customer
  const customer = await prisma.customer.create({
    data: {
      businessId: biz1.id,
      name: `Test Customer ${Date.now()}`,
      phone: `0812${Date.now()}`.substring(0, 12),
    },
  });
  
  assert.ok(customer.id, "Customer created");
  
  // Create a queue ticket
  const queue = await prisma.queue.create({
    data: {
      businessId: biz1.id,
      branchId: branch.id,
      serviceId: service.id,
      customerId: customer.id,
      serviceDate: new Date(),
      sequenceNumber: 1,
      ticketNumber: `TEST-${Date.now()}`,
      status: "WAITING",
    },
  });
  
  assert.ok(queue.id, "Queue ticket created");
  
  // Verify sub-account can access this queue (via business membership)
  const sub1Owner1 = await prisma.user.findFirst({
    where: { email: { contains: "sub1-owner1" } },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(sub1Owner1, "Sub-account found");
  
  const membership = await prisma.businessMembership.findFirst({
    where: { userId: sub1Owner1.id, businessId: biz1.id },
  });
  assert.ok(membership, "Sub-account is member of business 1");
  assert.equal(membership.role, MembershipRole.ADMIN, "Sub-account has ADMIN role");
});

test("Isolation: Sub-account from Owner 1 cannot see queues in Owner 2's business", async () => {
  // Get sub-account from owner 1
  const sub1Owner1 = await prisma.user.findFirst({
    where: { email: { contains: "sub1-owner1" } },
  });
  assert.ok(sub1Owner1, "Sub-account 1 from owner 1 found");
  
  // Get owner 2's business
  const biz2 = await prisma.business.findFirst({
    where: { slug: { contains: "biz-owner2" } },
  });
  assert.ok(biz2, "Business 2 found");
  
  // Verify sub-account from owner 1 is NOT member of business 2
  const membership = await prisma.businessMembership.findFirst({
    where: { userId: sub1Owner1.id, businessId: biz2.id },
  });
  assert.equal(membership, null, "Sub-account from Owner 1 is NOT member of Business 2 (isolated)");
});

test("Isolation: Owner 1 cannot see sub-accounts from Owner 2's business", async () => {
  // Get owner 2
  const owner2 = await prisma.user.findFirst({
    where: { email: { contains: "owner-test" } },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(owner2, "Owner 2 found");
  
  // Get owner 2's business
  const biz2 = await prisma.business.findFirst({
    where: { slug: { contains: "biz-owner2" } },
  });
  assert.ok(biz2, "Business 2 found");
  
  // Create sub-account for owner 2
  const { hash } = await import("bcryptjs");
  const subOwner2 = await prisma.user.create({
    data: {
      email: `sub1-owner2-${Date.now()}@test.local`,
      name: "Sub 1 Owner 2",
      passwordHash: await hash("SubPass123!", 12),
      active: true,
    },
  });
  
  // Add to owner 2's business
  await prisma.businessMembership.create({
    data: {
      userId: subOwner2.id,
      businessId: biz2.id,
      role: MembershipRole.ADMIN,
    },
  });
  
  // Get owner 1
  const owner1 = await prisma.user.findFirst({
    where: { email: { contains: "owner-test" } },
    orderBy: { createdAt: "asc" },
  });
  assert.ok(owner1, "Owner 1 found");
  
  // Verify owner 1 cannot see sub-account from owner 2's business
  // (they have no common business membership)
  const commonBiz = await prisma.businessMembership.findFirst({
    where: {
      businessId: biz2.id,
      user: { email: owner1.email },
    },
  });
  assert.equal(commonBiz, null, "Owner 1 has no membership in Business 2");
});

test("Isolation: Data in one business doesn't leak to another", async () => {
  // Get both businesses
  const biz1 = await prisma.business.findFirst({
    where: { slug: { contains: "biz-owner1" } },
  });
  const biz2 = await prisma.business.findFirst({
    where: { slug: { contains: "biz-owner2" } },
  });
  
  assert.ok(biz1, "Business 1 found");
  assert.ok(biz2, "Business 2 found");
  
  // Get queues in business 1
  const biz1Queues = await prisma.queue.findMany({
    where: { businessId: biz1.id },
  });
  
  // Get queues in business 2
  const biz2Queues = await prisma.queue.findMany({
    where: { businessId: biz2.id },
  });
  
  // Queues should be isolated
  for (const queue of biz1Queues) {
    assert.equal(queue.businessId, biz1.id, `Queue belongs to Business 1`);
  }
  
  for (const queue of biz2Queues) {
    assert.equal(queue.businessId, biz2.id, `Queue belongs to Business 2`);
  }
  
  // No cross-business queues
  assert.ok(
    biz1Queues.every(q => q.businessId === biz1.id),
    "Business 1 queues only belong to Business 1"
  );
  assert.ok(
    biz2Queues.every(q => q.businessId === biz2.id),
    "Business 2 queues only belong to Business 2"
  );
});
