/**
 * Bukti bahwa pembatasan akses loket ditegakkan di lapisan layanan, bukan cuma
 * disembunyikan di UI.
 *
 *   DATABASE_URL=... npx tsx scripts/verify-counter-access.ts
 *
 * Skenario:
 *  1. Cakupan loket ditulis lewat jalur resmi (service tim), sama seperti form
 *     "Akses loket" di dashboard.
 *  2. Operator yang hanya berhak atas Loket A tidak boleh menyentuh tiket Loket B
 *     -> wajib 403 COUNTER_FORBIDDEN dan status tiket tidak berubah.
 *  3. `callNext` ke loket yang bukan wewenangnya -> wajib ditolak juga.
 *  4. Loket yang menjadi wewenangnya tetap bisa dipanggil (kontrol positif).
 *  5. Cakupan dikembalikan ke [] (= semua loket) supaya data uji bersih.
 */
import { prisma } from "../src/lib/prisma";
import { AppError } from "../src/modules/shared/errors";
import { callNext, transitionQueue } from "../src/modules/queue/application/queue-service";
import { updateMember } from "../src/modules/tenancy/team-service";
import type { BusinessContext } from "../src/modules/tenancy/context";

const results: string[] = [];

function log(line: string) {
  results.push(line);
  console.log(line);
}

async function expectDenied(label: string, run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    if (
      error instanceof AppError &&
      (error.code === "COUNTER_FORBIDDEN" || error.code === "COUNTER_NOT_FOUND")
    ) {
      log(`${label} -> DITOLAK ${error.status} ${error.code}`);
      return;
    }
    throw error;
  }
  throw new Error(`${label} -> tidak ditolak, akses loket bocor`);
}

async function main() {
  const owner = await prisma.businessMembership.findFirst({
    where: { role: "OWNER", business: { active: true } },
    include: { business: { select: { id: true, slug: true } } },
  });
  if (!owner) throw new Error("Tidak ada membership OWNER aktif");
  const businessId = owner.business.id;

  const admin = await prisma.businessMembership.findFirst({
    where: { role: "ADMIN", businessId, user: { active: true } },
    select: { id: true, userId: true },
  });
  if (!admin) throw new Error("Tidak ada membership ADMIN untuk diuji");

  const branch = await prisma.branch.findFirst({
    where: { businessId, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!branch) throw new Error("Tidak ada cabang aktif");

  const counters = await prisma.counter.findMany({
    where: { branchId: branch.id, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, activeQueueId: true },
  });
  if (counters.length < 2) throw new Error("Butuh minimal 2 loket untuk uji pembatasan");

  // Loket "blocked" dipilih yang sedang memegang antrean, supaya langkah
  // "tiket milik loket lain" punya bahan uji. Loket lain jadi pembanding.
  const blocked = counters.find((counter) => counter.activeQueueId) ?? counters[0];
  const allowed = counters.find((counter) => counter.id !== blocked.id);
  if (!allowed) throw new Error("Butuh dua loket berbeda");

  const ownerContext: BusinessContext = {
    userId: owner.userId,
    businessId,
    businessSlug: owner.business.slug,
    role: "OWNER",
    branchIds: null,
    counterIds: null,
  };

  const scopedContext: BusinessContext = {
    userId: admin.userId,
    businessId,
    businessSlug: owner.business.slug,
    role: "ADMIN",
    branchIds: null,
    counterIds: [allowed.id],
  };

  log(`loket diuji -> boleh: ${allowed.name}, harus ditolak: ${blocked.name}`);

  // 1. Simpan cakupan lewat service tim (jalur yang dipakai form tim).
  const saved = await updateMember(ownerContext, admin.id, { counterIds: [allowed.id] });
  log(`updateMember -> counterIds=${JSON.stringify(saved.counterIds)}`);
  if (JSON.stringify(saved.counterIds) !== JSON.stringify([allowed.id])) {
    throw new Error("updateMember tidak menyimpan cakupan loket");
  }
  const persisted = await prisma.counterMember.findMany({
    where: { membershipId: admin.id },
    select: { counterId: true },
  });
  log(`CounterMember tersimpan -> ${JSON.stringify(persisted.map((row) => row.counterId))}`);
  if (persisted.length !== 1 || persisted[0].counterId !== allowed.id) {
    throw new Error("Tabel CounterMember tidak mencerminkan cakupan");
  }

  // 2. Tiket yang dipegang loket lain harus ditolak, tanpa mengubah data.
  const foreignTicket = await prisma.queue.findFirst({
    where: {
      businessId,
      status: { in: ["CALLED", "SERVING"] },
      counterId: blocked.id,
    },
    select: { id: true, ticketNumber: true, status: true },
  });
  if (foreignTicket) {
    const before = foreignTicket.status;
    await expectDenied(
      `transitionQueue(${foreignTicket.ticketNumber} milik ${blocked.name}, action=complete)`,
      () => transitionQueue(scopedContext, foreignTicket.id, "complete"),
    );
    const after = await prisma.queue.findUnique({
      where: { id: foreignTicket.id },
      select: { status: true },
    });
    log(`status tiket setelah ditolak -> ${before} => ${after?.status} (harus sama)`);
    if (after?.status !== before) throw new Error("Status berubah walau akses ditolak");
  } else {
    log("transitionQueue -> dilewati: tidak ada tiket aktif di loket terkunci");
  }

  // 3. Panggil nomor berikutnya di loket yang bukan wewenangnya.
  await expectDenied(`callNext(${blocked.name})`, () =>
    callNext(scopedContext, { branchId: branch.id, counterId: blocked.id }),
  );

  // 4. Kontrol positif: loket yang menjadi wewenangnya dikenali sistem.
  try {
    const called = await callNext(scopedContext, { branchId: branch.id, counterId: allowed.id });
    log(`callNext(${allowed.name}) -> dipanggil ${called.ticketNumber}`);
  } catch (error) {
    if (
      error instanceof AppError &&
      (error.code === "QUEUE_EMPTY" || error.code === "COUNTER_BUSY")
    ) {
      log(`callNext(${allowed.name}) -> loket dikenali, tidak ada nomor bebas (${error.code})`);
    } else if (error instanceof AppError && error.code === "FEATURE_DISABLED") {
      log(`callNext(${allowed.name}) -> loket dikenali (${error.code})`);
    } else {
      throw error;
    }
  }

  // 5. Bersihkan: cakupan kosong berarti semua loket.
  const restored = await updateMember(ownerContext, admin.id, { counterIds: [] });
  log(`cleanup -> counterIds=${JSON.stringify(restored.counterIds)} (harus [])`);
  const leftover = await prisma.counterMember.count({ where: { membershipId: admin.id } });
  log(`CounterMember sisa -> ${leftover} (harus 0)`);
  if (leftover !== 0) throw new Error("Cakupan tidak dibersihkan");

  console.log("COUNTER_ACCESS_OK");
}

main()
  .catch((error) => {
    console.error(
      "COUNTER_ACCESS_FAILED:",
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
