import type { Prisma } from "@prisma/client";
import { pickLeastLoadedCounter } from "@/modules/queue/domain/counter-assignment";

/**
 * Loket otomatis untuk satu tiket baru. Hanya berlaku untuk layanan yang
 * menyalakan `autoAssignCounter` (layanan berloket terpisah gedung/ruangan),
 * dan hanya ke loket yang memang melayani layanan itu. Tanpa kandidat, tiket
 * dibiarkan tanpa loket seperti perilaku lama: petugas memanggil bebas.
 */
export async function autoAssignCounter(
  db: Prisma.TransactionClient,
  params: {
    businessId: string;
    branchId: string;
    serviceId: string;
    serviceDate: Date;
  },
): Promise<string | null> {
  const service = await db.service.findFirst({
    where: {
      id: params.serviceId,
      businessId: params.businessId,
      autoAssignCounter: true,
    },
    select: { id: true },
  });
  if (!service) return null;

  const counters = await db.counter.findMany({
    where: {
      branchId: params.branchId,
      active: true,
      services: { some: { serviceId: params.serviceId } },
    },
    select: { id: true },
    orderBy: { code: "asc" },
  });
  if (!counters.length) return null;

  const loads = await db.queue.groupBy({
    by: ["counterId"],
    where: {
      branchId: params.branchId,
      serviceDate: params.serviceDate,
      status: "WAITING",
      counterId: { in: counters.map((counter) => counter.id) },
    },
    _count: { _all: true },
  });

  return pickLeastLoadedCounter(
    counters.map((counter) => ({
      id: counter.id,
      waiting:
        loads.find((load) => load.counterId === counter.id)?._count._all ?? 0,
    })),
  );
}
