/**
 * End-to-end check of counter (loket) management against the real database.
 *
 *   DATABASE_URL=... npx tsx scripts/verify-counter-flow.ts
 */
import { prisma } from "../src/lib/prisma";
import {
  createCounter,
  deleteCounter,
  listCounters,
  updateCounter,
} from "../src/modules/catalog/catalog-service";
import type { BusinessContext } from "../src/modules/tenancy/context";

async function main() {
  const membership = await prisma.businessMembership.findFirst({
    where: { role: "OWNER", business: { active: true } },
    include: { business: { select: { id: true, slug: true } } },
  });
  if (!membership) throw new Error("No active business with an OWNER membership found");

  const context: BusinessContext = {
    userId: membership.userId,
    businessId: membership.business.id,
    businessSlug: membership.business.slug,
    role: "OWNER",
    branchIds: null,
    counterIds: null,
  };

  const branch = await prisma.branch.findFirst({
    where: { businessId: context.businessId, active: true },
    select: { id: true, name: true },
  });
  if (!branch) throw new Error("No active branch for the business");

  const services = await prisma.service.findMany({
    where: { businessId: context.businessId, active: true },
    select: { id: true, name: true },
  });
  if (!services.length) throw new Error("Business has no active services");
  const serviceIds = services.map((service) => service.id);

  const results: string[] = [];
  const stamp = Date.now().toString(36).toUpperCase().slice(-4);

  // OWNER must be able to configure counters; this was the original 403 bug.
  const before = await listCounters(context, branch.id);
  results.push(`list(OWNER) -> ok, existing=${before.length}`);

  const created = await createCounter(context, {
    branchId: branch.id,
    name: "Loket Uji Otomatis",
    code: `T${stamp.slice(-3)}`,
    serviceIds: [serviceIds[0]],
  });
  results.push(`create  -> id=${created.id} code=${created.code}`);
  if (!created.id) throw new Error("createCounter returned no id");

  const afterCreate = await listCounters(context, branch.id);
  const listed = afterCreate.find((row) => row.id === created.id);
  results.push(`listed  -> present=${Boolean(listed)} services=${listed?.serviceIds.length}`);

  const renamed = await updateCounter(context, created.id, {
    name: "Loket Uji Diubah",
    serviceIds: serviceIds.slice(0, Math.min(2, serviceIds.length)),
  });
  results.push(`update  -> name=${renamed.name}`);

  const toggled = await updateCounter(context, created.id, { active: false });
  results.push(`toggle  -> active=${toggled.active}`);

  const removed = await deleteCounter(context, created.id);
  results.push(`delete  -> archived=${removed.archived}`);
  const stillThere = await prisma.counter.findUnique({ where: { id: created.id } });
  results.push(`cleanup -> rowRemoved=${stillThere === null}`);
  if (stillThere !== null) {
    await prisma.counter.update({ where: { id: created.id }, data: { active: false } });
  }

  const audit = await prisma.auditLog.count({
    where: {
      targetId: created.id,
      action: { in: ["COUNTER_CREATED", "COUNTER_UPDATED", "COUNTER_DELETED"] },
    },
  });
  results.push(`audit   -> entries=${audit}`);

  console.log(results.join("\n"));
  if (
    renamed.name !== "Loket Uji Diubah" ||
    toggled.active !== false ||
    !listed ||
    listed.serviceIds.length === 0 ||
    audit < 3
  ) {
    throw new Error("Counter flow verification failed");
  }
  console.log("COUNTER_FLOW_OK");
}

main()
  .catch((error) => {
    console.error("COUNTER_FLOW_FAILED:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
