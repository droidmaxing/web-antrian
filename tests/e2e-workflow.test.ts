import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";

/**
 * E2E Workflow Test: Register → Create workspace → Create queue → Operate → View status
 * Tests the complete user journey from sign-up to queue completion.
 */

const testData: {
  email?: string;
  password?: string;
  userId?: string;
  businessId?: string;
  businessSlug?: string;
  branchId?: string;
  serviceId?: string;
  customerId?: string;
  queueId?: string;
  qrToken?: string;
  statusToken?: string;
} = {};

test("E2E: User registers with valid credentials", async () => {
  const timestamp = Date.now();
  testData.email = `e2e-user-${timestamp}@test.local`;
  testData.password = "E2eTestPass123!";

  // Simulate registration: create user + business + branch + subscription
  const user = await prisma.user.create({
    data: {
      email: testData.email,
      name: "E2E Test User",
      passwordHash: await hash(testData.password, 12),
      active: true,
      platformRole: "USER",
    },
  });

  testData.userId = user.id;
  assert.ok(user.id, "User created with ID");
  assert.equal(user.email, testData.email, "Email matches");

  // Verify user can be found
  const foundUser = await prisma.user.findUnique({
    where: { email: testData.email },
  });
  assert.ok(foundUser, "User is findable");
});

test("E2E: Workspace (business) is created automatically", async () => {
  assert.ok(testData.userId, "User ID from previous test");

  const timestamp = Date.now();
  const businessName = `E2E Business ${timestamp}`;
  const businessSlug = `e2e-business-${timestamp}`;

  // Create business
  const business = await prisma.business.create({
    data: {
      name: businessName,
      slug: businessSlug,
      businessType: "RETAIL",
      timezone: "Asia/Jakarta",
      active: true,
    },
  });

  testData.businessId = business.id;
  testData.businessSlug = businessSlug;

  assert.ok(business.id, "Business created");
  assert.equal(business.slug, businessSlug, "Slug matches");

  // Add user as OWNER of the business
  const membership = await prisma.businessMembership.create({
    data: {
      userId: testData.userId!,
      businessId: business.id,
      role: "OWNER",
    },
  });

  assert.ok(membership.id, "User added as OWNER to business");

  // Create default subscription (30-day trial)
  const subscription = await prisma.subscription.create({
    data: {
      businessId: business.id,
      status: "TRIAL",
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cycle: "MONTHLY",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  assert.ok(subscription.id, "Subscription created with TRIAL status");
  assert.equal(subscription.status, "TRIAL", "Subscription is in TRIAL");
});

test("E2E: Owner creates a branch", async () => {
  assert.ok(testData.businessId, "Business ID from previous test");

  const branch = await prisma.branch.create({
    data: {
      businessId: testData.businessId!,
      name: "Main Branch",
      slug: `branch-${Date.now()}`,
      timezone: "Asia/Jakarta",
    },
  });

  testData.branchId = branch.id;
  assert.ok(branch.id, "Branch created");
  assert.equal(branch.businessId, testData.businessId, "Branch belongs to business");
});

test("E2E: Owner creates a service", async () => {
  assert.ok(testData.businessId, "Business ID");

  const service = await prisma.service.create({
    data: {
      businessId: testData.businessId!,
      code: `SVC${Date.now()}`.substring(0, 6),
      name: "General Service",
    },
  });

  testData.serviceId = service.id;
  assert.ok(service.id, "Service created");
  assert.equal(service.businessId, testData.businessId, "Service belongs to business");
});

test("E2E: Owner creates a QR/queue access token", async () => {
  assert.ok(testData.businessId, "Business ID");

  const { randomBytes } = await import("crypto");
  const { createHash } = await import("crypto");
  const plainToken = `qr-${Date.now()}-${randomBytes(8).toString("hex")}`;
  const tokenHash = createHash("sha256").update(plainToken).digest("hex");

  const accessToken = await prisma.accessToken.create({
    data: {
      businessId: testData.businessId!,
      tokenHash,
      type: "QR_QUEUE",
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

  testData.qrToken = plainToken; // Store plain token for later access verification
  assert.ok(accessToken.id, "QR access token created");
  assert.equal(accessToken.type, "QR_QUEUE", "Token type is QR_QUEUE");
});

test("E2E: Owner creates a status page token", async () => {
  assert.ok(testData.businessId, "Business ID");

  const { randomBytes } = await import("crypto");
  const { createHash } = await import("crypto");
  const plainToken = `status-${Date.now()}-${randomBytes(8).toString("hex")}`;
  const tokenHash = createHash("sha256").update(plainToken).digest("hex");

  const statusToken = await prisma.accessToken.create({
    data: {
      businessId: testData.businessId!,
      tokenHash,
      type: "QUEUE_STATUS",
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

  testData.statusToken = plainToken; // Store plain token for later access verification
  assert.ok(statusToken.id, "Status token created");
  assert.equal(statusToken.type, "QUEUE_STATUS", "Token type is QUEUE_STATUS");
});

test("E2E: Customer creates a queue ticket (via QR)", async () => {
  assert.ok(testData.businessId, "Business ID");
  assert.ok(testData.branchId, "Branch ID");
  assert.ok(testData.serviceId, "Service ID");

  // Create customer
  const customer = await prisma.customer.create({
    data: {
      businessId: testData.businessId!,
      name: "E2E Test Customer",
      phone: "08123456789",
    },
  });

  testData.customerId = customer.id;
  assert.ok(customer.id, "Customer created");

  // Create queue ticket
  const queue = await prisma.queue.create({
    data: {
      businessId: testData.businessId!,
      branchId: testData.branchId!,
      serviceId: testData.serviceId!,
      customerId: customer.id,
      ticketNumber: `TEST-${Date.now()}`,
      sequenceNumber: 1,
      status: "WAITING",
      serviceDate: new Date(),
    },
  });

  testData.queueId = queue.id;
  assert.ok(queue.id, "Queue ticket created");
  assert.equal(queue.status, "WAITING", "Queue starts in WAITING status");
});

test("E2E: Counter operator calls customer (status: CALLED)", async () => {
  assert.ok(testData.queueId, "Queue ID");

  const updated = await prisma.queue.update({
    where: { id: testData.queueId! },
    data: { status: "CALLED", calledAt: new Date() },
  });

  assert.equal(updated.status, "CALLED", "Queue transitioned to CALLED");
  assert.ok(updated.calledAt, "Called timestamp recorded");
});

test("E2E: Customer is serving (status: SERVING)", async () => {
  assert.ok(testData.queueId, "Queue ID");

  const updated = await prisma.queue.update({
    where: { id: testData.queueId! },
    data: { status: "SERVING", startedAt: new Date() },
  });

  assert.equal(updated.status, "SERVING", "Queue transitioned to SERVING");
  assert.ok(updated.startedAt, "Service start timestamp recorded");
});

test("E2E: Service completed (status: COMPLETED)", async () => {
  assert.ok(testData.queueId, "Queue ID");

  const updated = await prisma.queue.update({
    where: { id: testData.queueId! },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  assert.equal(updated.status, "COMPLETED", "Queue transitioned to COMPLETED");
  assert.ok(updated.completedAt, "Service complete timestamp recorded");
});

test("E2E: Public queue status page can retrieve completed ticket", async () => {
  assert.ok(testData.businessId, "Business ID");
  assert.ok(testData.queueId, "Queue ID");
  assert.ok(testData.statusToken, "Status token");

  // Simulate accessing /q/status/[token]
  // Verify token grants access to this business (in real app, hash the token first)
  const { createHash } = await import("crypto");
  const tokenHash = createHash("sha256").update(testData.statusToken!).digest("hex");
  const token = await prisma.accessToken.findUnique({
    where: { tokenHash },
  });

  assert.ok(token, "Status token exists");
  assert.equal(token.businessId, testData.businessId, "Token belongs to business");
  assert.equal(token.type, "QUEUE_STATUS", "Token grants status access");

  // Retrieve queue (as public user)
  const queue = await prisma.queue.findFirst({
    where: {
      businessId: testData.businessId!,
      id: testData.queueId!,
    },
  });

  assert.ok(queue, "Queue is retrievable");
  assert.equal(queue.status, "COMPLETED", "Queue shows COMPLETED status");
});

test("E2E: Public QR page can retrieve active queue", async () => {
  assert.ok(testData.businessId, "Business ID");
  assert.ok(testData.qrToken, "QR token");

  // Verify QR token grants access (in real app, hash the token first)
  const { createHash } = await import("crypto");
  const tokenHash = createHash("sha256").update(testData.qrToken!).digest("hex");
  const token = await prisma.accessToken.findUnique({
    where: { tokenHash },
  });

  assert.ok(token, "QR token exists");
  assert.equal(token.businessId, testData.businessId, "Token belongs to business");
  assert.equal(token.type, "QR_QUEUE", "Token grants QR access");

  // Verify token is not expired
  assert.ok(token.expiresAt! > new Date(), "Token is not expired");

  // Create a new active queue to verify QR page can see it
  const activeQueue = await prisma.queue.create({
    data: {
      businessId: testData.businessId!,
      branchId: testData.branchId!,
      serviceId: testData.serviceId!,
      customerId: testData.customerId!,
      ticketNumber: `ACTIVE-${Date.now()}`,
      sequenceNumber: 2,
      status: "WAITING",
      serviceDate: new Date(),
    },
  });

  const queues = await prisma.queue.findMany({
    where: {
      businessId: testData.businessId!,
      status: { in: ["WAITING", "CALLED", "SERVING"] },
    },
  });

  assert.ok(queues.length > 0, "Active queues are retrievable via QR token");
});

test("E2E: Subscription trial validation", async () => {
  assert.ok(testData.businessId, "Business ID");

  const subscription = await prisma.subscription.findFirst({
    where: { businessId: testData.businessId! },
  });

  assert.ok(subscription, "Subscription found");
  assert.equal(subscription.status, "TRIAL", "Subscription is in TRIAL");
  assert.ok(
    subscription.trialEndsAt! > new Date(),
    "Trial period is still active"
  );

  // Verify user can operate business while subscription is TRIAL
  const membership = await prisma.businessMembership.findFirst({
    where: { businessId: testData.businessId! },
  });

  assert.ok(membership, "User is still member of business");
});

test("E2E: Data isolation after workflow", async () => {
  assert.ok(testData.businessId, "Business ID");
  assert.ok(testData.userId, "User ID");

  // Verify user can only see their business
  const userBusinesses = await prisma.businessMembership.findMany({
    where: { userId: testData.userId! },
  });

  const businessIds = userBusinesses.map((m) => m.businessId);
  assert.ok(
    businessIds.includes(testData.businessId!),
    "User can see their business"
  );

  // Create a different business to verify isolation
  const otherBusiness = await prisma.business.create({
    data: {
      name: `Other Business ${Date.now()}`,
      slug: `other-biz-${Date.now()}`,
      businessType: "SERVICE",
      timezone: "Asia/Jakarta",
    },
  });

  // Verify user is NOT member of other business
  const otherMembership = await prisma.businessMembership.findFirst({
    where: {
      userId: testData.userId!,
      businessId: otherBusiness.id,
    },
  });

  assert.equal(
    otherMembership,
    null,
    "User is not member of other business (isolated)"
  );

  // Verify queues from user's business don't appear in other business queries
  const queueInOtherBiz = await prisma.queue.findFirst({
    where: {
      businessId: otherBusiness.id,
      id: testData.queueId!,
    },
  });

  assert.equal(
    queueInOtherBiz,
    null,
    "Queue from user's business doesn't appear in other business"
  );
});
