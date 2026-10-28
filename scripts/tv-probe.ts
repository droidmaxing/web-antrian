/**
 * Penolong uji layar TV sungguhan (dipakai bersama browser):
 *   npx tsx scripts/tv-probe.ts setup
 *   npx tsx scripts/tv-probe.ts call 02     # panggil tiket di loket lain
 *   npx tsx scripts/tv-probe.ts call 01     # panggil tiket di loket sendiri
 *   npx tsx scripts/tv-probe.ts cleanup
 * Token layar uji ditulis ke /tmp/tv_token.txt (tidak dicetak) agar browser bisa
 * membukanya tanpa ada kredensial yang menempel di log.
 */
import { prisma } from "../src/lib/prisma";
import { createDisplay } from "../src/modules/display/display-service";
import { writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import type { BusinessContext } from "../src/modules/tenancy/context";

const STATE = "/tmp/tv_probe_state.json";

async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

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

  if (command === "setup") {
    const counters = await prisma.counter.findMany({
      where: { branchId: branch.id, active: true },
      orderBy: { code: "asc" },
      include: { services: { select: { serviceId: true } } },
    });
    const mine = counters[0];
    if (!mine) throw new Error("Tidak ada loket aktif");
    const created = await createDisplay(context, branch.id, `Uji TV ${Date.now()}`, [mine.id]);
    writeFileSync("/tmp/tv_token.txt", created.token);
    writeFileSync(
      STATE,
      JSON.stringify(
        counters.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          serviceId: c.services[0]?.serviceId ?? null,
        })),
      ),
    );
    console.log(`Layar uji dibuat untuk loket ${mine.code} (cakupan 1 loket).`);
    console.log(`Jumlah loket aktif: ${counters.length}; display uji id=${created.display.id}`);
    return;
  }

  if (command === "call") {
    const counters = JSON.parse(readFileSync(STATE, "utf8")) as {
      id: string;
      code: string;
      name: string;
      serviceId: string | null;
    }[];
    const counter = counters.find((c) => c.code === arg);
    if (!counter) throw new Error(`Loket ${arg} tidak ada`);
    if (!counter.serviceId) throw new Error(`Loket ${arg} tidak punya layanan`);
    const waiting = await prisma.queue.findFirst({
      where: { branchId: branch.id, serviceId: counter.serviceId, status: "WAITING" },
    });
    if (!waiting) throw new Error(`Tidak ada tiket WAITING untuk layanan loket ${arg}`);
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
    writeFileSync("/tmp/tv_last_call.json", JSON.stringify({ ...counter, ticket: waiting.ticketNumber, eventId: event.id, queueId: waiting.id }));
    console.log(`Panggilan uji: ${waiting.ticketNumber} di loket ${counter.code}.`);
    return;
  }

  if (command === "cleanup") {
    if (existsSync("/tmp/tv_last_call.json")) {
      const last = JSON.parse(readFileSync("/tmp/tv_last_call.json", "utf8")) as {
        queueId: string;
        eventId: string;
      };
      await prisma.counter.updateMany({ where: { activeQueueId: last.queueId }, data: { activeQueueId: null } });
      await prisma.queue.update({
        where: { id: last.queueId },
        data: { status: "WAITING", counterId: null, calledAt: null },
      });
      await prisma.outboxEvent.deleteMany({ where: { id: last.eventId } });
      rmSync("/tmp/tv_last_call.json");
    }
    const displays = await prisma.display.findMany({
      where: { name: { startsWith: "Uji TV " } },
      select: { id: true },
    });
    await prisma.display.deleteMany({ where: { id: { in: displays.map((d) => d.id) } } });
    if (existsSync("/tmp/tv_token.txt")) rmSync("/tmp/tv_token.txt");
    if (existsSync(STATE)) rmSync(STATE);
    console.log(`Dibersihkan: ${displays.length} display uji, umpan dipulihkan.`);
    return;
  }

  throw new Error("Perintah: setup | call <kode loket> | cleanup");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
