/**
 * Bukti ujung-ke-ujung lewat HTTP: layar cakupan loket 01 tidak boleh menerima
 * event panggilan loket 02 pada endpoint publik yang benar-benar dipakai TV.
 *
 *   DATABASE_URL=... npx tsx scripts/verify-display-http.ts
 */
import { prisma } from "../src/lib/prisma";
import { createDisplay } from "../src/modules/display/display-service";
import type { BusinessContext } from "../src/modules/tenancy/context";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
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
  const mine = counters[0];
  const other = counters[1];
  if (!mine || !other) throw new Error("Butuh minimal 2 loket aktif");

  const created = await createDisplay(context, branch.id, `Uji HTTP ${Date.now()}`, [mine.id]);
  const token = created.token;
  log(`Display cakupan ${mine.code} dibuat; token ada (tidak dicetak).`);

  const planted: { queueId: string; eventId: string; counter: string; ticket: string }[] = [];
  for (const counter of [mine, other]) {
    const serviceId = counter.services[0]?.serviceId;
    if (!serviceId) continue;
    const waiting = await prisma.queue.findFirst({
      where: { branchId: branch.id, serviceId, status: "WAITING" },
    });
    if (!waiting) continue;
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
    planted.push({
      queueId: waiting.id,
      eventId: event.id,
      counter: counter.code,
      ticket: waiting.ticketNumber,
    });
    log(`Umpan: ${waiting.ticketNumber} dipanggil di ${counter.code}.`);
  }

  const after = new Date(Date.now() - 60_000).toISOString();
  // /events is an endless SSE stream, so read it briefly and abort — waiting for
  // it to finish hangs forever (there is no non-streaming variant).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  let text = "";
  try {
    const response = await fetch(
      `${BASE}/api/v1/public/displays/${token}/events?after=${encodeURIComponent(after)}`,
      { signal: controller.signal },
    );
    log(`GET /events -> HTTP ${response.status}, content-type=${response.headers.get("content-type")}`);
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    while (reader) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += decoder.decode(chunk.value, { stream: true });
    }
    await reader?.cancel();
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) throw error;
  } finally {
    clearTimeout(timer);
  }

  const events = text
    .split("\n\n")
    .filter((block) => block.startsWith("id: "))
    .map((block) => {
      const idLine = block.split("\n").find((line) => line.startsWith("id: ")) ?? "";
      const dataLine = block.split("\n").find((line) => line.startsWith("data: ")) ?? "";
      return { id: idLine.slice(4), data: dataLine.slice(6) };
    });
  log(`Event SSE terbaca: ${events.length} (dibaca 6 detik lalu koneksi ditutup)`);
  const idOf = (id: string) => id.split("|").pop();
  const mineEvent = planted.find((row) => row.counter === mine.code);
  const otherEvent = planted.find((row) => row.counter === other.code);
  const sawMine = mineEvent ? events.some((e) => idOf(e.id) === mineEvent.eventId) : null;
  const leaked = otherEvent ? events.filter((e) => idOf(e.id) === otherEvent.eventId) : [];
  log(`Event loket sendiri lolos via HTTP: ${sawMine === null ? "tidak diuji" : sawMine}`);
  log(`Event loket lain bocor via HTTP: ${leaked.length}`);

  // Snapshot juga harus dibatasi loket.
  const snap = await fetch(`${BASE}/api/v1/public/displays/${token}`);
  const snapBody = (await snap.json()) as {
    data?: { display: { scope: string; counterCount?: number }; queues: { counterCode: string }[] };
  };
  log(
    `GET /snapshot -> HTTP ${snap.status}, scope=${snapBody.data?.display.scope}, counterCount=${snapBody.data?.display.counterCount}, queues=${snapBody.data?.queues.length}`,
  );
  const wrongCounter = (snapBody.data?.queues ?? []).filter(
    (queue) => queue.counterCode && queue.counterCode !== mine.code,
  );
  log(`Snapshot memuat antrean loket lain: ${wrongCounter.length}`);

  for (const row of planted) {
    await prisma.counter.updateMany({
      where: { activeQueueId: row.queueId },
      data: { activeQueueId: null },
    });
    await prisma.queue.update({
      where: { id: row.queueId },
      data: { status: "WAITING", counterId: null, calledAt: null },
    });
  }
  await prisma.outboxEvent.deleteMany({ where: { id: { in: planted.map((r) => r.eventId) } } });
  await prisma.display.delete({ where: { id: created.display.id } });
  log("Umpan & display uji dibersihkan.");

  if (leaked.length || wrongCounter.length) {
    log("FAIL: cakupan loket bocor lewat HTTP.");
    process.exit(1);
  }
  if (sawMine !== true) {
    log("FAIL: event loket sendiri hilang — penyaringan terlalu ketat.");
    process.exit(1);
  }
  log("PASS: HTTP display menegakkan cakupan loket (positif lolos, negatif diblokir).");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
