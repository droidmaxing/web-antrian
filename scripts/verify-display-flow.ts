/**
 * End-to-end check of display (TV screen) management against the real database.
 * Covers what the UI now exposes: create, rename, deactivate, rotate token,
 * delete — plus the token hash actually being what `resolveDisplayToken` reads.
 *
 *   DATABASE_URL=... npx tsx scripts/verify-display-flow.ts
 */
import { prisma } from "../src/lib/prisma";
import {
  createDisplay,
  deleteDisplay,
  renameDisplay,
  resolveDisplayToken,
  rotateDisplayToken,
  setDisplayActive,
} from "../src/modules/display/display-service";
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

  const results: string[] = [];

  const created = await createDisplay(context, branch.id, "Display Uji Otomatis");
  results.push(`create   -> id=${created.display.id} tokenLen=${created.token.length}`);
  if (!created.display.id || created.token.length < 20) {
    throw new Error("createDisplay returned no id/token");
  }

  // The plaintext token must resolve; only its hash is stored.
  const resolved = await resolveDisplayToken(created.token);
  results.push(`resolve  -> displayId=${resolved.id} branch=${resolved.branch.name}`);
  if (resolved.id !== created.display.id) throw new Error("Token did not resolve to display");

  const row = await prisma.display.findUniqueOrThrow({
    where: { id: created.display.id },
    select: { tokenHash: true },
  });
  results.push(`hashed   -> storedPlaintext=${row.tokenHash === created.token}`);

  const renamed = await renameDisplay(context, created.display.id, "Display Uji Diubah");
  results.push(`rename   -> name=${renamed.name}`);

  const off = await setDisplayActive(context, created.display.id, false);
  results.push(`deactivate -> active=${off.active}`);
  let revokedResolve = "accepted";
  try {
    await resolveDisplayToken(created.token);
  } catch {
    revokedResolve = "rejected";
  }
  results.push(`inactive -> tokenResolve=${revokedResolve}`);
  if (revokedResolve !== "rejected") {
    throw new Error("Deactivated display still resolved its token");
  }
  await setDisplayActive(context, created.display.id, true);

  const rotated = await rotateDisplayToken(context, created.display.id);
  results.push(`rotate   -> newToken=${rotated.token !== created.token}`);
  let oldToken = "accepted";
  try {
    await resolveDisplayToken(created.token);
  } catch {
    oldToken = "rejected";
  }
  results.push(`rotate   -> oldTokenResolve=${oldToken}`);
  if (oldToken !== "rejected") throw new Error("Old token still valid after rotation");
  const newResolve = await resolveDisplayToken(rotated.token);
  results.push(`rotate   -> newTokenResolve=${newResolve.id === created.display.id}`);

  await deleteDisplay(context, created.display.id);
  const gone = await prisma.display.findUnique({ where: { id: created.display.id } });
  results.push(`delete   -> rowRemoved=${gone === null}`);
  if (gone !== null) throw new Error("Display row still present after delete");

  const audit = await prisma.auditLog.count({
    where: {
      targetId: created.display.id,
      action: {
        in: [
          "DISPLAY_CREATED",
          "DISPLAY_RENAMED",
          "DISPLAY_DEACTIVATED",
          "DISPLAY_ACTIVATED",
          "DISPLAY_TOKEN_ROTATED",
          "DISPLAY_DELETED",
        ],
      },
    },
  });
  results.push(`audit    -> entries=${audit}`);
  if (audit < 6) throw new Error(`Expected 6 audit entries, got ${audit}`);

  console.log(results.join("\n"));
  console.log("DISPLAY_FLOW_OK");
}

main()
  .catch((error) => {
    console.error("DISPLAY_FLOW_FAILED:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
