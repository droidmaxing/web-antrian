/**
 * Bukti isu #2: satu loket = satu layar = satu tautan. Buat 4 display, masing-
 * masing bercakupan satu loket, lalu pastikan tiap token hanya menampilkan
 * loketnya sendiri.
 *
 *   DATABASE_URL=... npx tsx scripts/verify-display-multi.ts
 */
import { prisma } from "../src/lib/prisma";
import { createDisplay } from "../src/modules/display/display-service";
import type { BusinessContext } from "../src/modules/tenancy/context";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";

async function main() {
  const owner = await prisma.businessMembership.findFirst({
    where: { role: "OWNER", business: { active: true } },
    include: { business: { select: { id: true, slug: true } } },
  });
  if (!owner) throw new Error("Tidak ada membership OWNER aktif");
  const businessId = owner.business.id;
  const branch = await prisma.branch.findFirst({ where: { businessId, active: true } });
  if (!branch) throw new Error("Tidak ada cabang aktif");
  const context: BusinessContext = {
    userId: owner.userId,
    businessId,
    businessSlug: owner.business.slug,
    role: "SUPER_ADMIN",
    branchIds: null,
    counterIds: null,
  };

  const counters = await prisma.counter.findMany({
    where: { branchId: branch.id, active: true },
    orderBy: { code: "asc" },
  });
  console.log(`Loket aktif: ${counters.length} (${counters.map((c) => c.code).join(", ")})`);

  const created: { code: string; token: string; displayId: string; name: string }[] = [];
  for (const counter of counters) {
    const row = await createDisplay(context, branch.id, `Uji 4 Layar ${counter.code}`, [counter.id]);
    created.push({ code: counter.code, token: row.token, displayId: row.display.id, name: `Uji 4 Layar ${counter.code}` });
  }

  console.log(`Display dibuat: ${created.length}`);
  const tokens = created.map((row) => row.token);
  console.log(`Token unik: ${new Set(tokens).size} dari ${tokens.length}`);
  for (const row of created) {
    console.log(`  loket ${row.code} -> tautan ...${row.token.slice(-6)} (${row.token.length} char)`);
  }

  let mismatches = 0;
  for (const row of created) {
    const response = await fetch(`${BASE}/api/v1/public/displays/${row.token}`);
    const body = (await response.json()) as {
      data?: {
        display: { scope: string; counterCount?: number; name: string };
        queues: { counterCode: string }[];
      };
    };
    const data = body.data;
    const wrong = (data?.queues ?? []).filter((q) => q.counterCode && q.counterCode !== row.code);
    if (data?.display.scope !== "counter" || data?.display.counterCount !== 1 || wrong.length) mismatches += 1;
    console.log(
      `  ${row.code}: HTTP ${response.status}, scope=${data?.display.scope}, counterCount=${data?.display.counterCount}, antrean loket lain=${wrong.length}`,
    );
  }

  // Tautan harus mengarah ke halaman TV yang benar, bukan satu halaman bersama.
  const page = await fetch(`${BASE}/display/${created[0].token}`);
  console.log(`Halaman TV token pertama -> HTTP ${page.status}`);

  await prisma.display.deleteMany({ where: { id: { in: created.map((row) => row.displayId) } } });
  console.log(`Display uji dihapus (${created.length}).`);

  if (new Set(tokens).size !== tokens.length || mismatches) {
    console.log("FAIL: layar tidak terpisah per loket.");
    process.exit(1);
  }
  console.log("PASS: 4 loket -> 4 layar -> 4 tautan berbeda, masing-masing hanya menampilkan loketnya.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
