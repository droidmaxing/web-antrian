import { timezoneOr } from "@/modules/shared/timezone";
import { createHash, randomBytes } from "node:crypto";
import { AccessTokenType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/modules/shared/errors";
import { getTheme } from "@/modules/tenancy/theme-service";
import { clientAddress, enforceRateLimit } from "@/modules/shared/rate-limit";

export function hashAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getQrConfiguration(token: string, request: Request) {
  const access = await prisma.accessToken.findUnique({
    where: { tokenHash: hashAccessToken(token) },
    include: {
      business: { select: { id: true, name: true, timezone: true, active: true } },
      branch: { select: { id: true, name: true, active: true } },
      service: { select: { id: true, name: true, code: true, active: true } },
    },
  });
  if (
    !access ||
    access.type !== AccessTokenType.QR_QUEUE ||
    access.revokedAt ||
    (access.expiresAt && access.expiresAt <= new Date()) ||
    !access.business.active ||
    !access.branch?.active
  ) {
    throw new AppError("QR tidak valid atau sudah tidak aktif.", 404, "INVALID_QR_TOKEN");
  }
  await enforceRateLimit(
    `qr-config:${access.id}:${clientAddress(request)}`,
    60,
    60,
  );
  await ensureQrEnabled(access.businessId);

  const services = await prisma.service.findMany({
    where: {
      businessId: access.businessId,
      active: true,
      ...(access.serviceId ? { id: access.serviceId } : {}),
    },
    select: { id: true, name: true, code: true, averageMinutes: true },
    orderBy: { name: "asc" },
  });
  return {
    business: access.business.name,
    branch: { id: access.branch.id, name: access.branch.name },
    services,
    theme: await getTheme(access.businessId),
  };
}

type IssueQueueInput = {
  serviceId: string;
  customerName: string;
  customerPhone?: string;
};

export async function issuePublicQueue(
  token: string,
  request: Request,
  input: IssueQueueInput,
) {
  const access = await prisma.accessToken.findUnique({
    where: { tokenHash: hashAccessToken(token) },
    include: {
      business: { select: { active: true, timezone: true } },
      branch: { select: { id: true, active: true, timezone: true } },
    },
  });
  if (
    !access ||
    access.type !== AccessTokenType.QR_QUEUE ||
    access.revokedAt ||
    (access.expiresAt && access.expiresAt <= new Date()) ||
    !access.business.active ||
    !access.branch?.active
  ) {
    throw new AppError("QR tidak valid atau sudah tidak aktif.", 404, "INVALID_QR_TOKEN");
  }
  await enforceRateLimit(
    `qr-issue:${access.id}:${clientAddress(request)}`,
    8,
    60,
  );
  await ensureQrEnabled(access.businessId);
  if (access.serviceId && access.serviceId !== input.serviceId) {
    throw new AppError("Layanan tidak tersedia pada QR ini.", 400, "SERVICE_NOT_AVAILABLE");
  }

  const branchId = access.branch.id;
  const service = await prisma.service.findFirst({
    where: {
      id: input.serviceId,
      businessId: access.businessId,
      active: true,
    },
    select: { id: true, code: true, averageMinutes: true },
  });
  if (!service) throw new AppError("Layanan tidak ditemukan.", 404, "SERVICE_NOT_FOUND");

  const timezone = timezoneOr(access.branch.timezone ?? access.business.timezone);
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const serviceDate = new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000Z`);
  const receiptToken = randomBytes(32).toString("base64url");

  return prisma.$transaction(
    async (tx) => {
      const existingCustomer = input.customerPhone
        ? await tx.customer.findFirst({
            where: {
              businessId: access.businessId,
              phone: input.customerPhone,
            },
            select: { id: true },
          })
        : null;
      const customer = existingCustomer
        ? await tx.customer.update({
            where: { id: existingCustomer.id },
            data: { name: input.customerName },
          })
        : await tx.customer.create({
            data: {
              businessId: access.businessId,
              name: input.customerName,
              phone: input.customerPhone,
            },
          });

      const sequenceKey = {
        branchId_serviceId_serviceDate: {
          branchId,
          serviceId: service.id,
          serviceDate,
        },
      };
      await tx.queueSequence.upsert({
        where: sequenceKey,
        create: { branchId, serviceId: service.id, serviceDate, lastNumber: 0 },
        update: {},
      });
      const sequence = await tx.queueSequence.update({
        where: sequenceKey,
        data: { lastNumber: { increment: 1 } },
        select: { lastNumber: true },
      });
      const queue = await tx.queue.create({
        data: {
          businessId: access.businessId,
          branchId,
          serviceId: service.id,
          customerId: customer.id,
          serviceDate,
          sequenceNumber: sequence.lastNumber,
          ticketNumber: `${service.code}-${String(sequence.lastNumber).padStart(3, "0")}`,
          issuedAt: now,
        },
        select: {
          id: true,
          ticketNumber: true,
          issuedAt: true,
          sequenceNumber: true,
          status: true,
        },
      });
      await tx.accessToken.create({
        data: {
          businessId: access.businessId,
          branchId,
          serviceId: service.id,
          queueId: queue.id,
          tokenHash: hashAccessToken(receiptToken),
          type: AccessTokenType.QUEUE_STATUS,
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
      });
      await tx.queueHistory.create({
        data: {
          queueId: queue.id,
          fromStatus: null,
          toStatus: "WAITING",
          action: "ISSUE",
        },
      });
      await tx.outboxEvent.create({
        data: {
          businessId: access.businessId,
          branchId,
          eventType: "queue.issued",
          aggregateId: queue.id,
          payload: { queueId: queue.id, ticketNumber: queue.ticketNumber },
        },
      });

      const [waitingAhead, inService, compatibleCounters] = await Promise.all([
        tx.queue.count({
          where: {
            branchId,
            serviceId: service.id,
            serviceDate,
            status: "WAITING",
            sequenceNumber: { lt: queue.sequenceNumber },
          },
        }),
        tx.queue.count({
          where: {
            branchId,
            serviceId: service.id,
            serviceDate,
            status: { in: ["CALLED", "SERVING"] },
          },
        }),
        tx.counterService.count({
          where: {
            serviceId: service.id,
            counter: { branchId, active: true },
          },
        }),
      ]);
      const parallelCapacity = Math.max(compatibleCounters, 1);
      return {
        queue,
        receiptToken,
        estimateMinutes:
          Math.ceil((waitingAhead + inService) / parallelCapacity) *
          service.averageMinutes,
      };
    },
    // Antrean QR di jam ramai bisa jatuh bersamaan; satu transaksi di sini
    // mengantre di baris queueSequence yang sama. Timeout bawaan Prisma 5 detik
    // terlalu ketat dan bikin 500 (P2028) untuk pelanggan yang sebenarnya cukup
    // menunggu sedikit lebih lama, jadi beri ruang 20 detik.
    { maxWait: 10_000, timeout: 20_000 },
  );
}

export async function getPublicQueueStatus(token: string, request: Request) {
  const access = await prisma.accessToken.findUnique({
    where: { tokenHash: hashAccessToken(token) },
    include: {
      queue: {
        include: {
          service: { select: { name: true, averageMinutes: true } },
          branch: { select: { name: true, timezone: true } },
          business: { select: { name: true, timezone: true } },
        },
      },
    },
  });
  if (
    !access ||
    access.type !== AccessTokenType.QUEUE_STATUS ||
    access.revokedAt ||
    (access.expiresAt && access.expiresAt <= new Date()) ||
    !access.queue
  ) {
    throw new AppError("Tautan status tidak valid atau sudah tidak aktif.", 404, "INVALID_STATUS_TOKEN");
  }
  await enforceRateLimit(
    `queue-status:${access.id}:${clientAddress(request)}`,
    60,
    60,
  );
  await ensureQrEnabled(access.businessId);
  const [ahead, inService, compatibleCounters] = await Promise.all([
    prisma.queue.count({
      where: {
        branchId: access.queue.branchId,
        serviceId: access.queue.serviceId,
        serviceDate: access.queue.serviceDate,
        status: "WAITING",
        sequenceNumber: { lt: access.queue.sequenceNumber },
      },
    }),
    prisma.queue.count({
      where: {
        branchId: access.queue.branchId,
        serviceId: access.queue.serviceId,
        serviceDate: access.queue.serviceDate,
        status: { in: ["CALLED", "SERVING"] },
      },
    }),
    prisma.counterService.count({
      where: {
        serviceId: access.queue.serviceId,
        counter: { branchId: access.queue.branchId, active: true },
      },
    }),
  ]);
  const parallelCapacity = Math.max(compatibleCounters, 1);
  return {
    ticketNumber: access.queue.ticketNumber,
    status: access.queue.status,
    service: access.queue.service.name,
    // Nama usaha & cabang dipakai struk cetak (printer termal 80mm), supaya
    // struk yang dibawa pelanggan masih jelas milik layar mana.
    business: access.queue.business.name,
    branch: access.queue.branch.name,
    waitingAhead: access.queue.status === "WAITING" ? ahead : 0,
    estimateMinutes:
      access.queue.status === "WAITING"
        ? Math.ceil((ahead + inService) / parallelCapacity) *
          access.queue.service.averageMinutes
        : 0,
    issuedAt: access.queue.issuedAt,
    timezone: timezoneOr(access.queue.branch.timezone ?? access.queue.business.timezone),
  };
}

async function ensureQrEnabled(businessId: string) {
  const feature = await prisma.featureConfiguration.findUnique({
    where: {
      businessId_featureKey: {
        businessId,
        featureKey: "QR_QUEUE",
      },
    },
    select: { enabled: true },
  });
  if (!feature?.enabled) {
    throw new AppError("Antrean QR sedang dinonaktifkan.", 404, "FEATURE_DISABLED");
  }
}
