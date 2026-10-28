import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listQueues } from "@/modules/queue/application/queue-service";
import { requireBusinessContext } from "@/modules/tenancy/context";
import { Dashboard } from "@/components/dashboard";
import { listBranchBookings } from "@/modules/booking/application/booking-service";
import { AppError } from "@/modules/shared/errors";
import { ErrorState } from "@/components/error-state";
import { getTheme } from "@/modules/tenancy/theme-service";

type PageProps = {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ branch?: string }>;
};

export const dynamic = "force-dynamic";

export default async function DashboardPage({ params, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { businessSlug } = await params;
  const { branch: requestedBranchId } = await searchParams;
  let context;
  try {
    context = await requireBusinessContext(businessSlug, requestedBranchId || undefined);
  } catch (error) {
    if (error instanceof AppError && error.status === 401) redirect("/login");
    if (error instanceof AppError && error.code === "BRANCH_NOT_FOUND") {
      redirect(`/dashboard/${businessSlug}`);
    }
    if (error instanceof AppError && error.status === 404) notFound();
    if (error instanceof AppError && error.status === 403) {
      return (
        <ErrorState
          code="403"
          title="Akses ke workspace ditolak"
          description="Akun Anda tidak memiliki izin untuk membuka workspace ini. Hubungi pemilik bisnis atau administrator."
        />
      );
    }
    throw error;
  }
  const [business, services, theme] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: context.businessId },
      select: {
        name: true,
        timezone: true,
        branches: {
          where: {
            active: true,
            ...(context.branchIds ? { id: { in: context.branchIds } } : {}),
          },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            timezone: true,
            counters: {
              where: { active: true },
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                name: true,
                code: true,
                activeQueue: {
                  select: {
                    ticketNumber: true,
                    status: true,
                    service: { select: { name: true } },
                  },
                },
                services: { select: { serviceId: true } },
              },
            },
          },
        },
      },
    }),
    prisma.service.findMany({
      where: { businessId: context.businessId, active: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    getTheme(context.businessId),
  ]);

  const branch =
    business.branches.find((option) => option.id === requestedBranchId) ??
    business.branches[0];
  if (!branch) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f8fa] p-6">
        <div className="max-w-md rounded-2xl border border-[#e9edeb] bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-medium text-brand-700">Belum ada cabang</p>
          <h1 className="mt-2 text-xl font-semibold text-[#182321]">
            Bisnis Anda belum memiliki cabang aktif
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#75827f]">
            Hubungi Super Admin bisnis untuk menyiapkan cabang operasional.
          </p>
        </div>
      </main>
    );
  }

  const queues = await listQueues(context, branch.id);
  /**
   * A counter-bound operator should not have to mentally skip other counters'
   * tickets. Waiting tickets have no counter yet, so they are kept when one of
   * the operator's counters can serve that service.
   */
  const accessibleQueues = context.counterIds
    ? (() => {
        const scopedCounters = branch.counters.filter((counter) =>
          context.counterIds!.includes(counter.id),
        );
        const serviceIds = new Set(
          scopedCounters.flatMap((counter) =>
            counter.services.map((entry) => entry.serviceId),
          ),
        );
        return queues.filter((queue) =>
          queue.counterId
            ? context.counterIds!.includes(queue.counterId)
            : serviceIds.has(queue.serviceId),
        );
      })()
    : queues;
  const completed = accessibleQueues.filter((queue) => queue.status === "COMPLETED");
  const waiting = accessibleQueues.filter((queue) => queue.status === "WAITING");
  const active = accessibleQueues.filter(
    (queue) => queue.status === "CALLED" || queue.status === "SERVING",
  );
  const serviceMinutes = completed
    .filter((queue) => queue.startedAt && queue.completedAt)
    .map(
      (queue) =>
        (queue.completedAt!.getTime() - queue.startedAt!.getTime()) / 60_000,
    );
  const averageServiceMinutes = serviceMinutes.length
    ? Math.round(serviceMinutes.reduce((sum, minutes) => sum + minutes, 0) / serviceMinutes.length)
    : 0;
  const averageWaitMinutes = accessibleQueues
    .filter((queue) => queue.startedAt)
    .map((queue) => (queue.startedAt!.getTime() - queue.issuedAt.getTime()) / 60_000);
  const waitTime = averageWaitMinutes.length
    ? Math.round(averageWaitMinutes.reduce((sum, minutes) => sum + minutes, 0) / averageWaitMinutes.length)
    : 0;
  const featureRows = await prisma.featureConfiguration.findMany({
    where: { businessId: context.businessId, enabled: true },
    select: { featureKey: true },
  });
  const bookingEnabled = featureRows.some((feature) => feature.featureKey === "BOOKING");
  const bookingDateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: branch.timezone ?? business.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const bookingDateValues = Object.fromEntries(
    bookingDateParts.map((part) => [part.type, part.value]),
  );
  const today = `${bookingDateValues.year}-${bookingDateValues.month}-${bookingDateValues.day}`;
  const bookings = bookingEnabled
    ? await listBranchBookings(context, branch.id, today)
    : [];

  return (
    <Dashboard
      businessName={business.name}
      businessSlug={businessSlug}
      theme={theme}
      branch={{

        id: branch.id,
        name: branch.name,
        timezone: branch.timezone ?? business.timezone,
        services,
        counters: branch.counters
          .filter(
            (counter) =>
              !context.counterIds || context.counterIds.includes(counter.id),
          )
          .map((counter) => ({
            ...counter,
            currentTicket: counter.activeQueue?.ticketNumber ?? null,
            currentService: counter.activeQueue?.service.name ?? null,
            queueStatus: counter.activeQueue?.status ?? null,
            // How many tickets this counter can actually serve right now: the
            // global WAITING count is useless for a counter that only handles
            // one service, which is what made "Panggil berikutnya" look broken.
            waitingForCounter: queues.filter(
              (queue) =>
                queue.status === "WAITING" &&
                counter.services.some((entry) => entry.serviceId === queue.serviceId),
            ).length,
          })),
      }}
      branches={business.branches.map((option) => ({ id: option.id, name: option.name }))}
      counters={business.branches.flatMap((option) =>
        option.counters.map((counter) => ({
          id: counter.id,
          name: counter.name,
          code: counter.code,
          branchId: option.id,
        })),
      )}
      role={context.role}
      user={{ id: context.userId, name: session.user.name ?? "Pengguna" }}
      userName={session.user.name ?? "Pengguna"}
      serverNow={new Date().toISOString()}
      enabledFeatures={featureRows.map((feature) => feature.featureKey)}
      bookings={bookings.map((booking) => ({
        id: booking.id,
        scheduledAt: booking.scheduledAt.toISOString(),
        status: booking.status,
        service: booking.service,
        customer: booking.customer,
        queue: booking.queue,
      }))}
      metrics={{
        total: accessibleQueues.length,
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        averageWaitMinutes: waitTime,
        averageServiceMinutes,
      }}
      queues={accessibleQueues.map((queue) => ({
        id: queue.id,
        ticketNumber: queue.ticketNumber,
        status: queue.status,
        issuedAt: queue.issuedAt.toISOString(),
        serviceName: queue.service.name,
        serviceCode: queue.service.code,
        serviceId: queue.service.id,
        counterName: queue.counter?.name ?? null,
        counterId: queue.counter?.id ?? null,
        customerName: queue.customer?.name ?? "Pelanggan",
      }))}
    />
  );
}
