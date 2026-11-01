import { timezoneOr } from "@/modules/shared/timezone";
import { createHash, randomBytes } from "node:crypto";
import { AccessTokenType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/modules/shared/errors";
import { getTheme } from "@/modules/tenancy/theme-service";
import { clientAddress, enforceRateLimit } from "@/modules/shared/rate-limit";
import { estimateWaitMinutes } from "@/modules/queue/domain/estimate";
import { dateForTimezone } from "@/modules/queue/domain/service-date";
import { intakeState, type IntakeMode, type IntakeState } from "@/modules/queue/domain/intake";
import { formatLocalDateTime } from "@/modules/booking/domain/time";
import { issueTicket } from "@/modules/queue/application/issue-ticket";
import { isFeatureEnabled } from "@/modules/feature/feature-gate";
import { isValidNik } from "@/modules/shared/nik";

/**
 * Satu kesimpulan buka/tutup untuk halaman QR dan API ambil nomor: tombol petugas
 * (manual) mengalahkan jam operasional, sisanya dihitung dari jam cabang hari itu.
 */
async function branchIntakeState(
  branchId: string,
  mode: IntakeMode,
  timezone: string,
  now: Date = new Date(),
): Promise<IntakeState> {
  const hours = await prisma.operatingHours.findMany({
    where: { branchId },
    select: { weekday: true, opensAt: true, closesAt: true, closed: true },
  });
  return intakeState({ mode, localDateTime: formatLocalDateTime(now, timezone), hours });
}

export function hashAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

type LiveEstimateParams = {
  branchId: string;
  serviceId: string;
  serviceDate: Date;
  /** Hanya hitung antrean dengan nomor di bawah ini (nomor pelanggan sendiri). */
  beforeSequence?: number;
  /** Estimasi default per antrean, dipakai berurutan. */
  minutesPerQueue: number;
};

/**
 * Satu sumber estimasi untuk QR, struk, dan halaman status: urutan antrean saat
 * ini (siapa di depan) x estimasi default layanan, plus buffer cabang.
 */
async function liveEstimate(db: Prisma.TransactionClient, params: LiveEstimateParams) {
  const [waitingAhead, inService, config] = await Promise.all([
    db.queue.count({
      where: {
        branchId: params.branchId,
        serviceId: params.serviceId,
        serviceDate: params.serviceDate,
        status: "WAITING",
        ...(params.beforeSequence === undefined
          ? {}
          : { sequenceNumber: { lt: params.beforeSequence } }),
      },
    }),
    db.queue.count({
      where: {
        branchId: params.branchId,
        serviceId: params.serviceId,
        serviceDate: params.serviceDate,
        status: { in: ["CALLED", "SERVING"] },
      },
    }),
    db.queueConfiguration.findUnique({
      where: { branchId: params.branchId },
      select: { estimateBuffer: true },
    }),
  ]);

  return {
    waitingAhead,
    inService,
    estimateMinutes: estimateWaitMinutes({
      ahead: waitingAhead + inService,
      minutesPerQueue: params.minutesPerQueue,
      bufferMinutes: config?.estimateBuffer ?? 0,
    }),
  };
}

export async function getQrConfiguration(token: string, request: Request) {
  const access = await prisma.accessToken.findUnique({
    where: { tokenHash: hashAccessToken(token) },
    include: {
      business: { select: { id: true, name: true, timezone: true, active: true } },
      branch: { select: { id: true, name: true, active: true, timezone: true, intakeMode: true } },
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
  // Estimasi dihitung per layanan supaya pelanggan melihat perkiraan tunggu
  // saat ini, bukan durasi layanan yang selalu sama sepanjang hari.
  const serviceDate = dateForTimezone(
    timezoneOr(access.branch.timezone ?? access.business.timezone),
  );
  const branchId = access.branch.id;
  const intake = await branchIntakeState(
    branchId,
    access.branch.intakeMode,
    timezoneOr(access.branch.timezone ?? access.business.timezone),
  );
  const withEstimates = await Promise.all(
    services.map(async (service) => ({
      ...service,
      estimateMinutes: (
        await liveEstimate(prisma, {
          branchId,
          serviceId: service.id,
          serviceDate,
          minutesPerQueue: service.averageMinutes,
        })
      ).estimateMinutes,
    })),
  );
  return {
    business: access.business.name,
    branch: { id: access.branch.id, name: access.branch.name },
    services: withEstimates,
    intake: { open: intake.open, reason: intake.reason, mode: access.branch.intakeMode },
    nikRequired: await isFeatureEnabled(access.businessId, "NIK"),
    theme: await getTheme(access.businessId),
  };
}

type IssueQueueInput = {
  serviceId: string;
  customerName: string;
  customerPhone?: string;
  customerNik?: string;
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
      branch: { select: { id: true, active: true, timezone: true, intakeMode: true } },
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
  const intake = await branchIntakeState(
    branchId,
    access.branch.intakeMode,
    timezoneOr(access.branch.timezone ?? access.business.timezone),
  );
  if (!intake.open) {
    throw new AppError(intake.reason, 409, "INTAKE_CLOSED");
  }
  const service = await prisma.service.findFirst({
    where: {
      id: input.serviceId,
      businessId: access.businessId,
      active: true,
    },
    select: { id: true, code: true, averageMinutes: true },
  });
  if (!service) throw new AppError("Layanan tidak ditemukan.", 404, "SERVICE_NOT_FOUND");

  // NIK opsional per bisnis (instansi tertentu mensyaratkannya untuk validasi).
  const nik = input.customerNik?.trim() ?? "";
  if (nik && !isValidNik(nik)) {
    throw new AppError("NIK harus 16 digit angka.", 400, "NIK_INVALID");
  }
  if (!nik && (await isFeatureEnabled(access.businessId, "NIK"))) {
    throw new AppError("NIK wajib diisi 16 digit angka.", 400, "NIK_REQUIRED");
  }

  const now = new Date();
  const serviceDate = dateForTimezone(
    timezoneOr(access.branch.timezone ?? access.business.timezone),
    now,
  );
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
            // Pelanggan lama yang pernah dinonaktifkan aktif lagi saat ambil nomor.
            data: { name: input.customerName, active: true, ...(nik ? { nik } : {}) },
          })
        : await tx.customer.create({
            data: {
              businessId: access.businessId,
              name: input.customerName,
              phone: input.customerPhone,
              nik: nik || null,
            },
          });

      const queue = await issueTicket(tx, {
        businessId: access.businessId,
        branchId,
        service,
        customerId: customer.id,
        serviceDate,
        action: "ISSUE",
        issuedAt: now,
      });

      // Tanpa baris ini tautan status yang dikembalikan ke pelanggan menunjuk
      // token yang tidak ada di DB, jadi halaman /q/status/<token> selalu
      // menjawab "tautan tidak valid" — padahal nomornya sudah terbit.
      await tx.accessToken.create({
        data: {
          businessId: access.businessId,
          branchId,
          serviceId: service.id,
          queueId: queue.id,
          tokenHash: hashAccessToken(receiptToken),
          type: AccessTokenType.QUEUE_STATUS,
        },
      });

      const live = await liveEstimate(tx, {
        branchId,
        serviceId: service.id,
        serviceDate,
        beforeSequence: queue.sequenceNumber,
        minutesPerQueue: service.averageMinutes,
      });
      return { queue, receiptToken, estimateMinutes: live.estimateMinutes };
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
          counter: { select: { name: true } },
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
  const live = await liveEstimate(prisma, {
    branchId: access.queue.branchId,
    serviceId: access.queue.serviceId,
    serviceDate: access.queue.serviceDate,
    beforeSequence: access.queue.sequenceNumber,
    minutesPerQueue: access.queue.service.averageMinutes,
  });
  return {
    ticketNumber: access.queue.ticketNumber,
    status: access.queue.status,
    service: access.queue.service.name,
    // Loket sudah ditetapkan sejak ambil nomor untuk layanan auto-loket.
    counter: access.queue.counter?.name ?? null,
    // Nama usaha & cabang dipakai struk cetak (printer termal 80mm), supaya
    // struk yang dibawa pelanggan masih jelas milik layar mana.
    business: access.queue.business.name,
    branch: access.queue.branch.name,
    waitingAhead: access.queue.status === "WAITING" ? live.waitingAhead : 0,
    estimateMinutes: access.queue.status === "WAITING" ? live.estimateMinutes : 0,
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
