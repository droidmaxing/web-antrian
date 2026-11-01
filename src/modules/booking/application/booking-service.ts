import { randomBytes } from "node:crypto";
import { AccessTokenType, BookingStatus, Prisma, QueueStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/modules/shared/errors";
import { getTheme } from "@/modules/tenancy/theme-service";
import { requireFeature, isFeatureEnabled } from "@/modules/feature/feature-gate";
import { issueTicket, releaseTicket } from "@/modules/queue/application/issue-ticket";
import { isValidNik } from "@/modules/shared/nik";
import {
  buildThirtyMinuteSlots,
  addLocalDays,
  getWeekday,
  isValidLocalDate,
  localDateInTimezone,
  localDateTimeToUtc,
} from "@/modules/booking/domain/time";
import {
  bookingStatusAfterAction,
  type BookingAction,
} from "@/modules/booking/domain/state-machine";
import { hashAccessToken } from "@/modules/queue/application/public-queue";
import {
  bookingLimitViolation,
  NO_SHOW_WINDOW_DAYS,
} from "@/modules/booking/domain/limits";
import { clientAddress, enforceRateLimit } from "@/modules/shared/rate-limit";
import { BusinessContext, requireRole } from "@/modules/tenancy/context";

const ACTIVE_BOOKING_STATUSES = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.CHECKED_IN,
] as const;

const BOOKING_WINDOW_DAYS = 30;

type BookingAccess = {
  id: string;
  businessId: string;
  branchId: string | null;
  serviceId: string | null;
  bookingId: string | null;
  business: { id: string; name: string; timezone: string; active: boolean };
  branch: { id: string; name: string; timezone: string | null; active: boolean } | null;
};

async function resolveBookingAccess(token: string): Promise<BookingAccess> {
  const access = await prisma.accessToken.findUnique({
    where: { tokenHash: hashAccessToken(token) },
    include: {
      business: {
        select: { id: true, name: true, timezone: true, active: true },
      },
      branch: {
        select: { id: true, name: true, timezone: true, active: true },
      },
    },
  });

  if (
    !access ||
    access.type !== AccessTokenType.BOOKING ||
    access.revokedAt ||
    (access.expiresAt && access.expiresAt <= new Date()) ||
    !access.business.active ||
    !access.branch?.active
  ) {
    throw new AppError("Tautan booking tidak valid atau sudah tidak aktif.", 404, "INVALID_BOOKING_TOKEN");
  }
  await requireFeature(access.businessId, "BOOKING");
  return access;
}

function branchTimezone(access: BookingAccess) {
  if (!access.branch) {
    throw new AppError("Cabang booking tidak ditemukan.", 404, "BRANCH_NOT_FOUND");
  }
  return access.branch.timezone ?? access.business.timezone;
}

function validateDate(localDate: string, timezone: string) {
  if (!isValidLocalDate(localDate)) {
    throw new AppError("Format tanggal tidak valid.", 400, "INVALID_BOOKING_DATE");
  }
  const today = localDateInTimezone(new Date(), timezone);
  // Booking online minimal H-1. Antrean hari ini diambil langsung di lokasi
  // lewat QR, jadi tidak perlu tanggal hari ini di tautan booking.
  const firstAllowedDate = addLocalDays(today, 1);
  const lastAllowedDate = addLocalDays(today, BOOKING_WINDOW_DAYS);
  if (localDate < firstAllowedDate || localDate > lastAllowedDate) {
    throw new AppError(
      `Booking online tersedia mulai besok (H-1) sampai ${BOOKING_WINDOW_DAYS} hari ke depan. Untuk hari ini, ambil nomor lewat QR di lokasi.`,
      400,
      "BOOKING_DATE_OUT_OF_RANGE",
    );
  }
}

async function getSchedule(
  branchId: string,
  businessId: string,
  serviceId: string,
  localDate: string,
  timezone: string,
) {
  const [hours, service] = await Promise.all([
    prisma.operatingHours.findUnique({
      where: { branchId_weekday: { branchId, weekday: getWeekday(localDate) } },
      select: { opensAt: true, closesAt: true, closed: true },
    }),
    prisma.service.findFirst({
      where: { id: serviceId, businessId, active: true },
      select: { id: true, name: true, code: true },
    }),
  ]);

  if (!service) {
    throw new AppError("Layanan booking tidak tersedia.", 404, "SERVICE_NOT_FOUND");
  }
  if (!hours) {
    throw new AppError("Jam operasional belum diatur untuk tanggal ini.", 409, "SCHEDULE_NOT_CONFIGURED");
  }
  return { hours, service, timezone };
}

export async function getBookingConfiguration(token: string, request: Request) {
  const access = await resolveBookingAccess(token);
  await enforceRateLimit(
    `booking-config:${access.id}:${clientAddress(request)}`,
    60,
    60,
  );
  const timezone = branchTimezone(access);
  const services = await prisma.service.findMany({
    where: {
      businessId: access.businessId,
      active: true,
      ...(access.serviceId ? { id: access.serviceId } : {}),
    },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
  const today = localDateInTimezone(new Date(), timezone);
  return {
    business: access.business.name,
    branch: { id: access.branch!.id, name: access.branch!.name },
    timezone,
    today,
    firstDate: addLocalDays(today, 1),
    lastDate: addLocalDays(today, BOOKING_WINDOW_DAYS),
    services,
    nikRequired: await isFeatureEnabled(access.businessId, "NIK"),
    theme: await getTheme(access.businessId),
  };
}

export async function getAvailableBookingSlots(
  token: string,
  request: Request,
  serviceId: string,
  localDate: string,
) {
  const access = await resolveBookingAccess(token);
  await enforceRateLimit(
    `booking-slots:${access.id}:${clientAddress(request)}`,
    60,
    60,
  );
  const timezone = branchTimezone(access);
  validateDate(localDate, timezone);
  if (access.serviceId && access.serviceId !== serviceId) {
    throw new AppError("Layanan tidak tersedia pada tautan ini.", 400, "SERVICE_NOT_AVAILABLE");
  }
  const { hours, service } = await getSchedule(
    access.branch!.id,
    access.businessId,
    serviceId,
    localDate,
    timezone,
  );
  if (hours.closed) return { date: localDate, service: service.name, slots: [] };

  const candidateSlots = buildThirtyMinuteSlots(localDate, timezone, hours);
  if (!candidateSlots.length) return { date: localDate, service: service.name, slots: [] };
  const existing = await prisma.bookingSlot.findMany({
    where: {
      branchId: access.branch!.id,
      serviceId,
      startsAt: {
        in: candidateSlots.map((slot) => slot.startsAt),
      },
    },
    select: { startsAt: true, bookingId: true },
  });
  const bookedTimes = new Set(
    existing.filter((slot) => slot.bookingId).map((slot) => slot.startsAt.toISOString()),
  );
  return {
    date: localDate,
    service: service.name,
    slots: candidateSlots.map((slot) => ({
      time: slot.localTime,
      available: !bookedTimes.has(slot.startsAt.toISOString()),
    })),
  };
}

export async function createPublicBooking(
  token: string,
  request: Request,
  input: {
    serviceId: string;
    date: string;
    time: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    customerNik?: string;
  },
) {
  const access = await resolveBookingAccess(token);
  await enforceRateLimit(
    `booking-create:${access.id}:${clientAddress(request)}`,
    8,
    60,
  );
  const timezone = branchTimezone(access);
  validateDate(input.date, timezone);
  if (access.serviceId && access.serviceId !== input.serviceId) {
    throw new AppError("Layanan tidak tersedia pada tautan ini.", 400, "SERVICE_NOT_AVAILABLE");
  }
  const { hours, service } = await getSchedule(
    access.branch!.id,
    access.businessId,
    input.serviceId,
    input.date,
    timezone,
  );
  if (hours.closed) {
    throw new AppError("Cabang tutup pada tanggal tersebut.", 409, "BRANCH_CLOSED");
  }

  // NIK opsional per bisnis (instansi tertentu mensyaratkannya untuk validasi).
  const nik = input.customerNik?.trim() ?? "";
  if (nik && !isValidNik(nik)) {
    throw new AppError("NIK harus 16 digit angka.", 400, "NIK_INVALID");
  }
  if (!nik && (await isFeatureEnabled(access.businessId, "NIK"))) {
    throw new AppError("NIK wajib diisi 16 digit angka.", 400, "NIK_REQUIRED");
  }

  const slotStart = localDateTimeToUtc(input.date, input.time, timezone);
  const slots = buildThirtyMinuteSlots(input.date, timezone, hours);
  if (!slots.some((slot) => slot.startsAt.getTime() === slotStart.getTime())) {
    throw new AppError("Waktu booking tidak tersedia.", 400, "INVALID_BOOKING_SLOT");
  }

  const bookingToken = randomBytes(32).toString("base64url");
  try {
    return await prisma.$transaction(
      async (tx) => {
        const slot = await tx.bookingSlot.upsert({
          where: {
            branchId_serviceId_startsAt: {
              branchId: access.branch!.id,
              serviceId: service.id,
              startsAt: slotStart,
            },
          },
          create: {
            branchId: access.branch!.id,
            serviceId: service.id,
            startsAt: slotStart,
          },
          update: {},
          select: { id: true },
        });
        await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT id FROM BookingSlot WHERE id = ${slot.id} FOR UPDATE`,
        );
        const lockedSlot = await tx.bookingSlot.findUniqueOrThrow({
          where: { id: slot.id },
          select: { bookingId: true },
        });
        if (lockedSlot.bookingId) {
          throw new AppError("Slot baru saja dipesan orang lain.", 409, "BOOKING_SLOT_TAKEN");
        }

        // Satu pelanggan = satu baris per bisnis: nomor telepon yang sama dipakai
        // ulang supaya riwayat kunjungan tidak pecah jadi banyak duplikat.
        const phone = input.customerPhone.replace(/[^\d+]/g, "");
        const existingCustomer = await tx.customer.findFirst({
          where: { businessId: access.businessId, phone },
          select: { id: true },
        });
        const customer = existingCustomer
          ? await tx.customer.update({
              where: { id: existingCustomer.id },
              data: {
                name: input.customerName,
                active: true,
                ...(input.customerEmail ? { email: input.customerEmail } : {}),
                ...(nik ? { nik } : {}),
              },
              select: { id: true },
            })
          : await tx.customer.create({
              data: {
                businessId: access.businessId,
                name: input.customerName,
                phone,
                email: input.customerEmail,
                nik: nik || null,
              },
              select: { id: true },
            });
        // Anti-fake: satu nomor tidak boleh menyapu slot. Dihitung di dalam
        // transaksi setelah slot terkunci supaya dua request paralel tetap kena.
        const dayStart = localDateTimeToUtc(input.date, "00:00", timezone);
        const dayEnd = localDateTimeToUtc(input.date, "23:59", timezone);
        const [sameServiceSameDay, activeSameDay, recentNoShows] = await Promise.all([
          tx.booking.count({
            where: {
              businessId: access.businessId,
              customerId: customer.id,
              serviceId: service.id,
              status: { in: [...ACTIVE_BOOKING_STATUSES] },
              scheduledAt: { gte: dayStart, lte: dayEnd },
            },
          }),
          tx.booking.count({
            where: {
              businessId: access.businessId,
              customerId: customer.id,
              status: { in: [...ACTIVE_BOOKING_STATUSES] },
              scheduledAt: { gte: dayStart, lte: dayEnd },
            },
          }),
          tx.booking.count({
            where: {
              businessId: access.businessId,
              customerId: customer.id,
              status: BookingStatus.NO_SHOW,
              scheduledAt: {
                gte: new Date(Date.now() - NO_SHOW_WINDOW_DAYS * 24 * 60 * 60 * 1000),
              },
            },
          }),
        ]);
        const limit = bookingLimitViolation({ sameServiceSameDay, activeSameDay, recentNoShows });
        if (limit) throw new AppError(limit.message, 409, limit.code);
        const booking = await tx.booking.create({
          data: {
            businessId: access.businessId,
            branchId: access.branch!.id,
            serviceId: service.id,
            customerId: customer.id,
            scheduledAt: slotStart,
            // Identitas pelanggan sudah dikunci (NIK wajib/opsional per bisnis)
            // dan slotnya dipesan khusus, jadi booking tidak lagi menunggu
            // moderasi petugas: langsung terkonfirmasi.
            status: BookingStatus.CONFIRMED,
          },
          select: { id: true, scheduledAt: true, status: true },
        });
        await tx.bookingSlot.update({
          where: { id: slot.id },
          data: { bookingId: booking.id },
        });
        // Nomor antrean terbit saat booking dibuat supaya pelanggan langsung tahu
        // nomornya, tanpa menunggu petugas menekan check-in di hari-H.
        const ticket = await issueTicket(tx, {
          businessId: access.businessId,
          branchId: access.branch!.id,
          service,
          customerId: customer.id,
          serviceDate: new Date(`${input.date}T00:00:00.000Z`),
          action: "BOOKING_CREATE",
          bookingId: booking.id,
          source: "BOOKING",
        });
        await tx.accessToken.create({
          data: {
            businessId: access.businessId,
            branchId: access.branch!.id,
            bookingId: booking.id,
            tokenHash: hashAccessToken(bookingToken),
            type: AccessTokenType.BOOKING,
            expiresAt: new Date(slotStart.getTime() + 24 * 60 * 60 * 1000),
          },
        });
        await tx.auditLog.create({
          data: {
            businessId: access.businessId,
            branchId: access.branch!.id,
            action: "BOOKING_CREATED",
            targetType: "Booking",
            targetId: booking.id,
            metadata: { serviceId: service.id, scheduledAt: slotStart.toISOString() },
          },
        });
        await tx.outboxEvent.create({
          data: {
            businessId: access.businessId,
            branchId: access.branch!.id,
            eventType: "booking.created",
            aggregateId: booking.id,
            payload: {
              bookingId: booking.id,
              serviceName: service.name,
              scheduledAt: booking.scheduledAt.toISOString(),
              status: booking.status,
            },
          },
        });
        return {
          id: booking.id,
          scheduledAt: booking.scheduledAt,
          status: booking.status,
          service: service.name,
          branch: access.branch!.name,
          timezone,
          statusToken: bookingToken,
          queueTicket: ticket.ticketNumber,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AppError("Slot baru saja dipesan orang lain.", 409, "BOOKING_SLOT_TAKEN");
    }
    throw error;
  }
}

export async function getPublicBookingStatus(token: string, request: Request) {
  const access = await resolveBookingAccess(token);
  if (!access.bookingId) {
    throw new AppError("Tautan ini bukan tautan status booking.", 404, "BOOKING_NOT_FOUND");
  }
  await enforceRateLimit(
    `booking-status:${access.id}:${clientAddress(request)}`,
    60,
    60,
  );
  const booking = await prisma.booking.findFirst({
    where: { id: access.bookingId, businessId: access.businessId },
    include: {
      branch: { select: { name: true, timezone: true, business: { select: { timezone: true } } } },
      service: { select: { name: true } },
      queue: { select: { ticketNumber: true, status: true } },
    },
  });
  if (!booking) throw new AppError("Booking tidak ditemukan.", 404, "BOOKING_NOT_FOUND");
  return {
    id: booking.id,
    status: booking.status,
    scheduledAt: booking.scheduledAt,
    timezone: booking.branch.timezone ?? booking.branch.business.timezone,
    branch: booking.branch.name,
    service: booking.service.name,
    queue: booking.queue,
  };
}

export async function listBranchBookings(
  context: BusinessContext,
  branchId: string,
  date: string,
) {
  requireRole(context, ["ADMIN", "SUPER_ADMIN", "OWNER"]);
  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      businessId: context.businessId,
      active: true,
      ...(context.branchIds ? { id: { in: context.branchIds } } : {}),
    },
    select: {
      id: true,
      timezone: true,
      business: { select: { timezone: true } },
    },
  });
  if (!branch) throw new AppError("Cabang tidak ditemukan.", 404, "BRANCH_NOT_FOUND");
  const timezone = branch.timezone ?? branch.business.timezone;
  if (!isValidLocalDate(date)) {
    throw new AppError("Format tanggal tidak valid.", 400, "INVALID_BOOKING_DATE");
  }
  const start = localDateTimeToUtc(date, "00:00", timezone);
  const end = localDateTimeToUtc(addLocalDays(date, 1), "00:00", timezone);
  return prisma.booking.findMany({
    where: {
      businessId: context.businessId,
      branchId,
      scheduledAt: { gte: start, lt: end },
    },
    include: {
      service: { select: { name: true, code: true } },
      customer: { select: { name: true, phone: true } },
      queue: { select: { id: true, ticketNumber: true, status: true } },
    },
    orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
  });
}

export async function transitionBooking(
  context: BusinessContext,
  bookingId: string,
  action: BookingAction,
) {
  requireRole(context, ["ADMIN", "SUPER_ADMIN"]);
  return prisma.$transaction(
    async (tx) => {
      const visible = await tx.booking.findFirst({
        where: {
          id: bookingId,
          businessId: context.businessId,
          ...(context.branchIds ? { branchId: { in: context.branchIds } } : {}),
        },
        select: { id: true },
      });
      if (!visible) throw new AppError("Booking tidak ditemukan.", 404, "BOOKING_NOT_FOUND");
      await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM Booking WHERE id = ${bookingId} AND businessId = ${context.businessId} FOR UPDATE`,
      );
      const booking = await tx.booking.findFirst({
        where: {
          id: bookingId,
          businessId: context.businessId,
          ...(context.branchIds ? { branchId: { in: context.branchIds } } : {}),
        },
        include: {
          branch: { select: { active: true, timezone: true, business: { select: { timezone: true } } } },
          service: { select: { id: true, code: true, name: true, autoAssignCounter: true } },
          queue: { select: { id: true, ticketNumber: true, status: true } },
        },
      });
      if (!booking || !booking.branch.active) {
        throw new AppError("Booking tidak ditemukan.", 404, "BOOKING_NOT_FOUND");
      }
      const alreadyCheckedIn =
        action === "check-in" && booking.status === BookingStatus.CHECKED_IN;
      // Check-in yang diulang (dobel klik/refresh) bukan error: status dan nomor
      // tetap sama, jadi tidak ada nomor kedua dan tidak ada 409.
      const nextStatus = alreadyCheckedIn
        ? booking.status
        : bookingStatusAfterAction(booking.status, action);

      // Nomor antrean sudah terbit saat booking dibuat; check-in hanya mengubah
      // status booking. Booking lama (tanpa nomor) tetap menerbitkan di sini.
      let queueTicket: string | null = booking.queue?.ticketNumber ?? null;
      if (action === "check-in" && !alreadyCheckedIn) {
        const timezone =
          booking.branch.timezone ?? booking.branch.business.timezone;
        const localDate = localDateInTimezone(
          booking.scheduledAt,
          timezone,
        );
        if (localDateInTimezone(new Date(), timezone) !== localDate) {
          throw new AppError("Booking hanya dapat check-in pada tanggal janji.", 409, "BOOKING_NOT_TODAY");
        }
        // Nomor sudah terbit saat booking dibuat; booking lama (tanpa nomor)
        // menerbitkan di sini supaya tidak ada pelanggan tanpa antrean.
        if (!booking.queue) {
          const ticket = await issueTicket(tx, {
            businessId: context.businessId,
            branchId: booking.branchId,
            service: booking.service,
            customerId: booking.customerId,
            serviceDate: new Date(`${localDate}T00:00:00.000Z`),
            action: "BOOKING_CHECK_IN",
            bookingId: booking.id,
            actorUserId: context.userId,
            source: "BOOKING",
          });
          queueTicket = ticket.ticketNumber;
        }
      }

      await tx.booking.update({
        where: { id: booking.id },
        data: { status: nextStatus },
      });
      if (action === "cancel" || nextStatus === BookingStatus.NO_SHOW) {
        await tx.bookingSlot.updateMany({
          where: { bookingId: booking.id },
          data: { bookingId: null },
        });
        // Nomor yang sudah terbit jangan menggantung di daftar tunggu petugas.
        if (booking.queue) {
          await releaseTicket(tx, {
            queueId: booking.queue.id,
            status: action === "cancel" ? QueueStatus.CANCELLED : QueueStatus.NO_SHOW,
            actorUserId: context.userId,
          });
        }
      }
      await tx.auditLog.create({
        data: {
          businessId: context.businessId,
          actorUserId: context.userId,
          branchId: booking.branchId,
          action: `BOOKING_${action.replace("-", "_").toUpperCase()}`,
          targetType: "Booking",
          targetId: booking.id,
          metadata: queueTicket ? { queueTicket } : undefined,
        },
      });
      await tx.outboxEvent.create({
        data: {
          businessId: context.businessId,
          branchId: booking.branchId,
          eventType: `booking.${action}`,
          aggregateId: booking.id,
          payload: {
            bookingId: booking.id,
            status: nextStatus,
            scheduledAt: booking.scheduledAt.toISOString(),
            queueTicket,
          },
        },
      });
      return { id: booking.id, status: nextStatus, queueTicket };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}
