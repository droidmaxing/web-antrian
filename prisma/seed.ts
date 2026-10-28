import "dotenv/config";
import {
  FeatureKey,
  MembershipRole,
  PrismaClient,
  QueueStatus,
} from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@antrian.test";
  const passwordHash = await hash("Antrian123!", 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, active: true, name: "Raka Pratama" },
    create: { email, passwordHash, active: true, name: "Raka Pratama" },
  });
  const superAdminEmail = "spv@antrian.test";
  const superAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {
      passwordHash: await hash("SuperAdmin123!", 12),
      active: true,
      name: "Nadia Supervisor",
    },
    create: {
      email: superAdminEmail,
      passwordHash: await hash("SuperAdmin123!", 12),
      active: true,
      name: "Nadia Supervisor",
    },
  });
  const ownerEmail = "owner@antrian.test";
  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {
      passwordHash: await hash("Owner12345!", 12),
      active: true,
      name: "Dewi Pemilik",
    },
    create: {
      email: ownerEmail,
      passwordHash: await hash("Owner12345!", 12),
      active: true,
      name: "Dewi Pemilik",
    },
  });

  const business = await prisma.business.upsert({
    where: { slug: "klinik-sehat" },
    update: {},
    create: {
      name: "Klinik Sehat Sentosa",
      slug: "klinik-sehat",
      businessType: "HEALTHCARE",
      timezone: "Asia/Jakarta",
      branches: {
        create: {
          name: "Cabang Menteng",
          slug: "menteng",
          timezone: "Asia/Jakarta",
          queueConfig: { create: { ticketPrefix: "A", resetDaily: true } },
        },
      },
    },
    include: { branches: true },
  });
  const branch =
    business.branches[0] ??
    (await prisma.branch.findFirstOrThrow({ where: { businessId: business.id } }));

  for (let weekday = 0; weekday < 7; weekday += 1) {
    await prisma.operatingHours.upsert({
      where: { branchId_weekday: { branchId: branch.id, weekday } },
      update: {
        opensAt: "09:00",
        closesAt: "17:00",
        closed: weekday === 0,
      },
      create: {
        branchId: branch.id,
        weekday,
        opensAt: "09:00",
        closesAt: "17:00",
        closed: weekday === 0,
      },
    });
  }

  const membership = await prisma.businessMembership.upsert({
    where: { userId_businessId: { userId: user.id, businessId: business.id } },
    update: { role: MembershipRole.ADMIN },
    create: { userId: user.id, businessId: business.id, role: MembershipRole.ADMIN },
  });
  await prisma.membershipBranchScope.upsert({
    where: { membershipId_branchId: { membershipId: membership.id, branchId: branch.id } },
    update: {},
    create: { membershipId: membership.id, branchId: branch.id },
  });
  await prisma.businessMembership.upsert({
    where: {
      userId_businessId: {
        userId: superAdmin.id,
        businessId: business.id,
      },
    },
    update: { role: MembershipRole.SUPER_ADMIN },
    create: {
      userId: superAdmin.id,
      businessId: business.id,
      role: MembershipRole.SUPER_ADMIN,
    },
  });
  await prisma.businessMembership.upsert({
    where: {
      userId_businessId: {
        userId: owner.id,
        businessId: business.id,
      },
    },
    update: { role: MembershipRole.OWNER },
    create: {
      userId: owner.id,
      businessId: business.id,
      role: MembershipRole.OWNER,
    },
  });

  // Sama dengan data layanan yang ada sekarang di cabang Menteng, diurutkan
  // menurut nama layanan.
  const serviceDefinitions = [
    { code: "ANAK", name: "Pemeriksaan Anak", averageMinutes: 10 },
    { code: "GIGI", name: "Pemeriksaan Gigi", averageMinutes: 18 },
    { code: "KDAN", name: "Pemeriksaan Kandungan", averageMinutes: 10 },
    { code: "LAB", name: "Laboratorium", averageMinutes: 8 },
    { code: "MATA", name: "Pemeriksaan Mata", averageMinutes: 10 },
    { code: "UMUM", name: "Konsultasi Umum", averageMinutes: 12 },
  ];
  const services = await Promise.all(
    serviceDefinitions.map((definition) =>
      prisma.service.upsert({
        where: {
          businessId_code: { businessId: business.id, code: definition.code },
        },
        update: definition,
        create: { businessId: business.id, ...definition },
      }),
    ),
  );

  // Satu loket bisa melayani lebih dari satu layanan, persis seperti penugasan
  // loket yang berjalan sekarang (loket 04 memakai kode "L4", loket 05 melayani
  // layanan Anak dan Kandungan).
  const counterDefinitions = [
    { code: "01", name: "Loket 01", serviceCodes: ["UMUM"] },
    { code: "02", name: "Loket 02", serviceCodes: ["GIGI"] },
    { code: "03", name: "Loket 03", serviceCodes: ["MATA"] },
    { code: "L4", name: "Loket 04", serviceCodes: ["LAB"] },
    { code: "L5", name: "Loket 05", serviceCodes: ["ANAK", "KDAN"] },
  ];
  const countersByCode = new Map<string, { id: string }>();
  // Peta layanan→loket dipakai ulang saat membuat antrean demo di bawah, supaya
  // tidak ada antrean yang duduk di loket yang tidak melayani layanan itu.
  const counterByServiceCode = new Map<string, { id: string }>();
  for (const definition of counterDefinitions) {
    const counter = await prisma.counter.upsert({
      where: { branchId_code: { branchId: branch.id, code: definition.code } },
      update: { name: definition.name, active: true },
      create: { branchId: branch.id, code: definition.code, name: definition.name },
    });
    countersByCode.set(definition.code, counter);
    for (const code of definition.serviceCodes) {
      const service = services.find((item) => item.code === code);
      if (!service) continue;
      counterByServiceCode.set(code, counter);
      await prisma.counterService.upsert({
        where: { counterId_serviceId: { counterId: counter.id, serviceId: service.id } },
        update: {},
        create: { counterId: counter.id, serviceId: service.id },
      });
    }
  }

  /**
   * Layar TV mengikuti data yang ada sekarang: satu layar lobi (tanpa cakupan
   * loket = semua loket) plus satu layar di depan tiap loket. Yang disimpan
   * hanya hash token, jadi tautan hanya tercetak saat layar pertama kali
   * dibuat — layar yang sudah ada dibiarkan apa adanya supaya TV yang sudah
   * terpasang tidak kehilangan tautannya.
   */
  const displayDefinitions: { name: string; counterCodes: string[] }[] = [
    { name: "Display Lobby", counterCodes: [] },
    { name: "LOKET01", counterCodes: ["01"] },
    { name: "LOKET02", counterCodes: ["02"] },
    { name: "LOKET03", counterCodes: ["03"] },
    { name: "LOKET04", counterCodes: ["L4"] },
    { name: "LOKET05", counterCodes: ["L5"] },
  ];
  const displayTokens: { name: string; token: string }[] = [];
  for (const definition of displayDefinitions) {
    const existing = await prisma.display.findFirst({
      where: { businessId: business.id, branchId: branch.id, name: definition.name },
      select: { id: true },
    });
    if (existing) continue;
    const token = randomBytes(32).toString("base64url");
    await prisma.display.create({
      data: {
        businessId: business.id,
        branchId: branch.id,
        name: definition.name,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        counters: {
          create: definition.counterCodes
            .map((code) => countersByCode.get(code))
            .filter((counter): counter is { id: string } => Boolean(counter))
            .map((counter) => ({ counterId: counter.id })),
        },
      },
    });
    displayTokens.push({ name: definition.name, token });
  }

  const featureDefaults: Record<FeatureKey, boolean> = {
    QR_QUEUE: true,
    BOOKING: true,
    WHATSAPP: false,
    TV_DISPLAY: true,
    VOICE_CALL: true,
    MULTI_COUNTER: true,
    ANALYTICS: true,
    ADVERTISEMENT: false,
    MULTI_BRANCH: false,
  };
  for (const [featureKey, enabled] of Object.entries(featureDefaults)) {
    await prisma.featureConfiguration.upsert({
      where: {
        businessId_featureKey: {
          businessId: business.id,
          featureKey: featureKey as FeatureKey,
        },
      },
      update: { enabled },
      create: { businessId: business.id, featureKey: featureKey as FeatureKey, enabled },
    });
  }

  // Poster QR yang sudah dicetak tidak boleh mati gara-gara container di-seed
  // ulang saat start: token lama dipertahankan apa adanya, token baru hanya
  // dibuat kalau belum ada. Teks token hanya diketahui saat baru dibuat, jadi
  // tautannya cuma dicetak ulang pada run yang benar-benar membuatnya.
  const existingQrToken = await prisma.accessToken.findFirst({
    where: { businessId: business.id, type: "QR_QUEUE" },
    select: { id: true },
  });
  const qrToken = existingQrToken
    ? null
    : randomBytes(32).toString("base64url");
  if (qrToken) {
    await prisma.accessToken.create({
      data: {
        businessId: business.id,
        branchId: branch.id,
        tokenHash: createHash("sha256").update(qrToken).digest("hex"),
        type: "QR_QUEUE",
      },
    });
  }
  const existingBookingToken = await prisma.accessToken.findFirst({
    where: { businessId: business.id, type: "BOOKING", bookingId: null },
    select: { id: true },
  });
  const bookingToken = existingBookingToken
    ? null
    : randomBytes(32).toString("base64url");
  if (bookingToken) {
    await prisma.accessToken.create({
      data: {
        businessId: business.id,
        branchId: branch.id,
        tokenHash: createHash("sha256").update(bookingToken).digest("hex"),
        type: "BOOKING",
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });
  }

  const today = new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: branch.timezone ?? "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()) + "T00:00:00.000Z",
  );
  const queueCount = await prisma.queue.count({
    where: { businessId: business.id, branchId: branch.id, serviceDate: today },
  });

  if (queueCount === 0) {
    // Customers are matched by phone so re-seeding on a new day reuses the same
    // people instead of inserting a fresh copy every run.
    // Kontak demo = daftar pelanggan yang ada di database sekarang, diurutkan
    // menurut nama. Real digits matter: normalizePhone() must be able to
    // canonicalise them, otherwise duplicate detection can never fire.
    const customerDefinitions = [
      { name: "aditya", phone: "0821312312" },
      { name: "ari", phone: "08214114324" },
      { name: "Bima Saputra", phone: "081200000002" },
      { name: "Budi Santoso", phone: "081234567890" },
      { name: "Dewi Lestari", phone: "081200000005" },
      { name: "meli", phone: "08423423423" },
      { name: "Nadia Putri", phone: "081200000001" },
      { name: "Rizky Ananda", phone: "081200000004" },
      { name: "Siti Rahma", phone: "081200000003" },
      { name: "utari", phone: "08234324324" },
      { name: "willy", phone: "08321332432" },
      { name: "zidan", phone: "0823213123" },
    ];
    const customersByPhone = new Map(
      await Promise.all(
        customerDefinitions.map(async (definition) => {
          const existing = await prisma.customer.findFirst({
            where: { businessId: business.id, phone: definition.phone },
            select: { id: true },
          });
          const customer =
            existing ??
            (await prisma.customer.create({
              data: { businessId: business.id, ...definition },
            }));
          return [definition.phone, customer] as const;
        }),
      ),
    );

    /**
     * Antrean demo memakai kode layanan + nomor urut eksplisit sebagai acuan,
     * bukan indeks array: urutannya mengikuti nama pelanggan seperti daftar di
     * database sekarang, sementara nomor antreannya tetap sama dengan yang ada
     * di database.
     */
    const records: {
      serviceCode: string;
      sequenceNumber: number;
      status: QueueStatus;
      customerPhone: string;
      /** Ada loket yang menangani antrean ini (sudah dipanggil). */
      atCounter?: boolean;
      /** Antrean yang sedang duduk di loket (Counter.activeQueueId). */
      activeCounter?: boolean;
    }[] = [
      { serviceCode: "UMUM", sequenceNumber: 4, status: QueueStatus.WAITING, customerPhone: "0821312312" },
      { serviceCode: "ANAK", sequenceNumber: 1, status: QueueStatus.WAITING, customerPhone: "08214114324" },
      { serviceCode: "GIGI", sequenceNumber: 1, status: QueueStatus.CALLED, customerPhone: "081200000002", atCounter: true, activeCounter: true },
      { serviceCode: "MATA", sequenceNumber: 1, status: QueueStatus.WAITING, customerPhone: "081200000005" },
      { serviceCode: "KDAN", sequenceNumber: 1, status: QueueStatus.CALLED, customerPhone: "08423423423", atCounter: true, activeCounter: true },
      { serviceCode: "GIGI", sequenceNumber: 2, status: QueueStatus.WAITING, customerPhone: "081200000001" },
      { serviceCode: "UMUM", sequenceNumber: 1, status: QueueStatus.COMPLETED, customerPhone: "081200000001", atCounter: true },
      { serviceCode: "LAB", sequenceNumber: 1, status: QueueStatus.WAITING, customerPhone: "081200000004" },
      { serviceCode: "UMUM", sequenceNumber: 2, status: QueueStatus.CALLED, customerPhone: "081200000003", atCounter: true, activeCounter: true },
      { serviceCode: "GIGI", sequenceNumber: 3, status: QueueStatus.WAITING, customerPhone: "08234324324" },
      { serviceCode: "GIGI", sequenceNumber: 4, status: QueueStatus.WAITING, customerPhone: "08321332432" },
      { serviceCode: "UMUM", sequenceNumber: 3, status: QueueStatus.WAITING, customerPhone: "0823213123" },
    ];
    for (const [index, record] of records.entries()) {
      const service = services.find((item) => item.code === record.serviceCode);
      const customer = customersByPhone.get(record.customerPhone);
      if (!service || !customer) continue;
      const counter =
        record.atCounter || record.activeCounter
          ? (counterByServiceCode.get(record.serviceCode) ?? null)
          : null;
      const issuedAt = new Date(Date.now() - (index + 1) * 6 * 60_000);
      const queue = await prisma.queue.create({
        data: {
          businessId: business.id,
          branchId: branch.id,
          serviceId: service.id,
          customerId: customer.id,
          counterId: counter?.id,
          serviceDate: today,
          sequenceNumber: record.sequenceNumber,
          ticketNumber: `${service.code}-${String(record.sequenceNumber).padStart(3, "0")}`,
          status: record.status,
          issuedAt,
          calledAt: counter ? new Date(issuedAt.getTime() + 3 * 60_000) : null,
          startedAt: record.status === QueueStatus.SERVING ? new Date() : null,
          completedAt: record.status === QueueStatus.COMPLETED ? new Date() : null,
        },
      });
      if (counter && record.activeCounter) {
        await prisma.counter.update({
          where: { id: counter.id },
          data: { activeQueueId: queue.id },
        });
      }
      await prisma.queueHistory.create({
        data: {
          queueId: queue.id,
          counterId: counter?.id,
          fromStatus: null,
          toStatus: record.status,
          action: "SEED",
        },
      });
    }
  }

  for (const service of services) {
    const latestQueue = await prisma.queue.findFirst({
      where: { branchId: branch.id, serviceId: service.id, serviceDate: today },
      orderBy: { sequenceNumber: "desc" },
      select: { sequenceNumber: true },
    });
    const sequenceKey = {
      branchId_serviceId_serviceDate: {
        branchId: branch.id,
        serviceId: service.id,
        serviceDate: today,
      },
    };
    const currentSequence = await prisma.queueSequence.findUnique({
      where: sequenceKey,
      select: { lastNumber: true },
    });
    if (!currentSequence || currentSequence.lastNumber < (latestQueue?.sequenceNumber ?? 0)) {
      await prisma.queueSequence.upsert({
        where: sequenceKey,
        create: {
          branchId: branch.id,
          serviceId: service.id,
          serviceDate: today,
          lastNumber: latestQueue?.sequenceNumber ?? 0,
        },
        update: { lastNumber: latestQueue?.sequenceNumber ?? 0 },
      });
    }
  }

  const appUrl = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  console.info(`Demo user: ${email} / Antrian123!`);
  console.info(`Demo Super Admin: ${superAdminEmail} / SuperAdmin123!`);
  console.info(`Demo Owner (read-only): ${ownerEmail} / Owner12345!`);
  console.info(`Business: ${business.slug}`);
  console.info(
    qrToken
      ? appUrl
        ? `Demo QR: ${appUrl}/q/${qrToken}`
        : `Demo QR token: ${qrToken} (set APP_URL untuk mencetak URL lengkap)`
      : "QR demo sudah ada; tautannya tidak dicetak ulang (poster lama tetap berlaku).",
  );
  console.info(
    bookingToken
      ? appUrl
        ? `Demo booking: ${appUrl}/book/${bookingToken}`
        : `Demo booking token: ${bookingToken} (set APP_URL untuk mencetak URL lengkap)`
      : "Booking demo sudah ada; tautannya tidak dicetak ulang.",
  );
  for (const entry of displayTokens) {
    console.info(
      appUrl
        ? `Demo display ${entry.name}: ${appUrl}/display/${entry.token}`
        : `Demo display ${entry.name} token: ${entry.token} (set APP_URL untuk mencetak URL lengkap)`,
    );
  }
  if (!displayTokens.length) {
    console.info("Display demo sudah ada; tautannya tidak dicetak ulang.");
  }
}

main()
  .catch((error: unknown) => {
    console.error("Database seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
