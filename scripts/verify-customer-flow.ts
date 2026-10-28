/**
 * End-to-end check of the customer module against the real database.
 *
 * Runs the same service functions the API routes call, so a pass here means the
 * Prisma queries, tenant scoping and audit logging all work on the live schema.
 *
 *   DATABASE_URL=... npx tsx scripts/verify-customer-flow.ts
 */
import { prisma } from "../src/lib/prisma";
import {
  createCustomer,
  deleteCustomer,
  listCustomers,
  updateCustomer,
} from "../src/modules/customer/customer-service";
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
  const stamp = Date.now();
  const phone = `0812${String(stamp).slice(-8)}`;
  const results: string[] = [];

  const created = await createCustomer(context, {
    name: "Uji Pelanggan Otomatis",
    phone: `+62${phone.slice(1)}`,
    email: `uji.${stamp}@contoh.com`,
  });
  results.push(`create  -> id=${created.id} phone=${created.phone}`);

  const listed = await listCustomers(context, { query: phone });
  const found = listed.rows.find((row) => row.id === created.id);
  results.push(
    `list    -> total=${listed.total} page=${listed.page}/${listed.pageCount} found=${Boolean(found)} queueCount=${found?.queueCount}`,
  );

  const updated = await updateCustomer(context, created.id, { name: "Uji Pelanggan Diubah" });
  results.push(`update  -> name=${updated.name}`);

  let duplicateBlocked = false;
  try {
    const other = await createCustomer(context, { name: "Duplikat Nomor", phone });
    await deleteCustomer(context, other.id);
  } catch (error) {
    duplicateBlocked = (error as { code?: string }).code === "DUPLICATE_PHONE";
    results.push(`dup     -> blocked=${duplicateBlocked} code=${(error as { code?: string }).code}`);
  }
  if (!duplicateBlocked) throw new Error("Duplicate phone was not rejected");

  let crossTenantBlocked = false;
  try {
    await updateCustomer(
      { ...context, businessId: "business-that-does-not-match" },
      created.id,
      { name: "Silang Tenant" },
    );
  } catch (error) {
    crossTenantBlocked = (error as { code?: string }).code === "CUSTOMER_NOT_FOUND";
  }
  results.push(`tenant  -> crossTenantBlocked=${crossTenantBlocked}`);
  if (!crossTenantBlocked) throw new Error("Cross-tenant update was not blocked");

  const audit = await prisma.auditLog.count({
    where: { targetId: created.id, action: { in: ["CUSTOMER_CREATED", "CUSTOMER_UPDATED"] } },
  });
  results.push(`audit   -> entries=${audit}`);

  await deleteCustomer(context, created.id);
  const gone = await prisma.customer.findUnique({ where: { id: created.id } });
  results.push(`delete  -> removed=${gone === null}`);

  console.log(results.join("\n"));
  const failed =
    !found || updated.name !== "Uji Pelanggan Diubah" || !duplicateBlocked ||
    !crossTenantBlocked || audit < 2 || gone !== null;
  if (failed) throw new Error("Customer flow verification failed");
  console.log("CUSTOMER_FLOW_OK");
}

main()
  .catch((error) => {
    console.error("CUSTOMER_FLOW_FAILED:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
