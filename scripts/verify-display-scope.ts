/**
 * Bukti perbaikan isu #1/#2: layar yang dibatasi ke satu loket tidak boleh
 * menerima (dan karena itu tidak boleh mengumumkan) panggilan loket lain.
 *
 * Snapshot awal sudah disaring per loket; yang bocor adalah aliran event SSE.
 *
 *   DATABASE_URL=... npx tsx scripts/verify-display-scope.ts
 */
import { prisma } from "../src/lib/prisma";
import { createDisplay, getDisplayEvents } from "../src/modules/display/display-service";
import type { BusinessContext } from "../src/modules/tenancy/context";

function log(line: string) {
  console.log(line);
}

async function main() {
  const owner = await prisma.businessMembership.findFirst({
    where: { role: "OWNER", business: { active: true } },
    include: { business: { select: { id: true, slug: true } } },
  });
  if (!owner) throw new Error("Tidak ada membership OWNER aktif");
  const businessId = owner.business.id;
  const context: BusinessContext = {
    userId: owner.userId,
    businessId,
    businessSlug: owner.business.slug,
    role: "SUPER_ADMIN",
    branchIds: null,
    counterIds: null,
  };

  const branch = await prisma.branch.findFirst({ where: { businessId, active: true } });
  if (!branch) throw new Error("Tidak ada cabang aktif");
  const counters = await prisma.counter.findMany({
    where: { branchId: branch.id, active: true },
    orderBy: { code: "asc" },
    include: { services: { select: { serviceId: true } } },
  });
  if (counters.length < 2) throw new Error("Butuh minimal 2 loket aktif");
  const mine = counters[0];
  const other = counters[1];
  log(`Loket diuji: ${mine.code} (${mine.name}) vs ${other.code} (${other.name})`);

  const created = await createDisplay(context, branch.id, `Uji Bocor ${Date.now()}`, [mine.id]);
  log(`Display cakupan loket ${mine.code} dibuat: ${created.display.id}`);

  // Dua umpan sekaligus: satu panggilan di loket sendiri (harus LOLOS) dan satu
  // di loket lain (harus TERBLOKIR). Tanpa umpan positif, "0 bocor" tidak
  // membuktikan apa pun — bisa jadi memang tidak ada event sama sekali.
  const otherService = other.services[0]?.serviceId;
  const mineService = mine.services[0]?.serviceId;
  const planted: string[] = [];
  const calls: {
    id: string;
    queueId: string;
    ticket: string;
    counterId: string;
    counterName: string;
    serviceId: string;
  }[] = [];

  for (const [counter, serviceId, label] of [
    [mine, mineService, "loket sendiri (harus lolos)"],
    [other, otherService, "loket lain (harus diblokir)"],
  ] as const) {
    if (!serviceId) {
      log(`Loket ${counter.code} tidak punya layanan, umpan dilewati.`);
      continue;
    }
    const waiting = await prisma.queue.findFirst({
      where: { branchId: branch.id, serviceId, status: "WAITING" },
    });
    if (!waiting) {
      log(`Tidak ada tiket WAITING untuk layanan loket ${counter.code}, umpan dilewati.`);
      continue;
    }
    await prisma.queue.update({
      where: { id: waiting.id },
      data: { status: "CALLED", counterId: counter.id, calledAt: new Date() },
    });
    const event = await prisma.outboxEvent.create({
      data: {
        businessId,
        branchId: branch.id,
        eventType: "queue.called",
        aggregateId: waiting.id,
        payload: {
          queueId: waiting.id,
          ticketNumber: waiting.ticketNumber,
          counterId: counter.id,
          counterName: counter.name,
          status: "CALLED",
        },
      },
      select: { id: true },
    });
    planted.push(waiting.id);
    calls.push({
      id: event.id,
      queueId: waiting.id,
      ticket: waiting.ticketNumber,
      counterId: counter.id,
      counterName: counter.name,
      serviceId,
    });
    log(`Umpan ${label}: ${waiting.ticketNumber} dipanggil di ${counter.code} (event ${event.id}).`);
  }

  const events = await getDisplayEvents(created.token, new Date(Date.now() - 60_000).toISOString());
  const mineCall = calls.find((call) => call.counterId === mine.id);
  const otherCall = calls.find((call) => call.counterId !== mine.id);
  // Exact planted-event identity: matching on queueId would also catch the
  // ticket's earlier counter-less `queue.issued` event and report a false leak.
  const idOf = (event: { id: string }) => event.id.split("|").pop();
  const sawMine = mineCall ? events.some((event) => idOf(event) === mineCall.id) : null;
  const leaked = otherCall ? events.filter((event) => idOf(event) === otherCall.id) : [];

  log(`Event diterima layar ${mine.code}: ${events.length}`);
  log(`Event loket sendiri lolos: ${sawMine === null ? "tidak diuji" : sawMine}`);
  log(`Event loket lain bocor: ${leaked.length}`);

  // Kembalikan umpan supaya data operasional tidak berubah.
  for (const queueId of planted) {
    const row = await prisma.queue.findUnique({ where: { id: queueId }, select: { counterId: true } });
    if (row?.counterId) {
      await prisma.counter.updateMany({
        where: { id: row.counterId, activeQueueId: queueId },
        data: { activeQueueId: null },
      });
    }
    await prisma.queue.update({
      where: { id: queueId },
      data: { status: "WAITING", counterId: null, calledAt: null },
    });
  }
  await prisma.outboxEvent.deleteMany({ where: { id: { in: calls.map((call) => call.id) } } });
  await prisma.display.delete({ where: { id: created.display.id } });
  log("Umpan & display uji dibersihkan.");

  if (leaked.length) {
    log(`FAIL: ${leaked.length} event loket lain lolos ke layar cakupan loket.`);
    process.exit(1);
  }
  if (sawMine !== true) {
    log("FAIL: event loket sendiri ikut terbuang — penyaringan terlalu ketat.");
    process.exit(1);
  }
  log("PASS: aliran event layar mengikuti cakupan loket (positif lolos, negatif diblokir).");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
