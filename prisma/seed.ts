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

  const serviceDefinitions = [
    { code: "UMUM", name: "Konsultasi Umum", averageMinutes: 12 },
    { code: "GIGI", name: "Pemeriksaan Gigi", averageMinutes: 18 },
    { code: "LAB", name: "Laboratorium", averageMinutes: 8 },
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

  const counterDefinitions = [
    { code: "01", name: "Loket 01", serviceCodes: ["UMUM", "GIGI"] },
    { code: "02", name: "Loket 02", serviceCodes: ["UMUM", "LAB"] },
    { code: "03", name: "Loket 03", serviceCodes: ["GIGI", "LAB"] },
  ];
  for (const definition of counterDefinitions) {
    const counter = await prisma.counter.upsert({
      where: { branchId_code: { branchId: branch.id, code: definition.code } },
      update: { name: definition.name, active: true },
      create: { branchId: branch.id, code: definition.code, name: definition.name },
    });
    for (const code of definition.serviceCodes) {
      const service = services.find((item) => item.code === code);
      if (!service) continue;
      await prisma.counterService.upsert({
        where: { counterId_serviceId: { counterId: counter.id, serviceId: service.id } },
        update: {},
        create: { counterId: counter.id, serviceId: service.id },
      });
    }
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

  await prisma.accessToken.deleteMany({
    where: { businessId: business.id, type: "QR_QUEUE" },
  });
  const qrToken = randomBytes(32).toString("base64url");
  await prisma.accessToken.create({
    data: {
      businessId: business.id,
      branchId: branch.id,
      tokenHash: createHash("sha256").update(qrToken).digest("hex"),
      type: "QR_QUEUE",
    },
  });
  await prisma.accessToken.deleteMany({
    where: { businessId: business.id, type: "BOOKING", bookingId: null },
  });
  const bookingToken = randomBytes(32).toString("base64url");
  await prisma.accessToken.create({
    data: {
      businessId: business.id,
      branchId: branch.id,
      tokenHash: createHash("sha256").update(bookingToken).digest("hex"),
      type: "BOOKING",
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

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
    const customers = [];
    // Demo contacts. Real digits matter: normalizePhone() must be able to
    // canonicalise them, otherwise duplicate detection can never fire.
    const phones = [
      "081200000001",
      "081200000002",
      "081200000003",
      "081200000004",
      "081200000005",
    ];
    for (const [index, name] of [
      "Nadia Putri",
      "Bima Saputra",
      "Siti Rahma",
      "Rizky Ananda",
      "Dewi Lestari",
    ].entries()) {
      const phone = phones[index];
      const existing = await prisma.customer.findFirst({
        where: { businessId: business.id, phone },
        select: { id: true },
      });
      customers.push(
        existing ??
          (await prisma.customer.create({
            data: { businessId: business.id, name, phone },
          })),
      );
    }
    const records = [
      { service: services[0], status: QueueStatus.SERVING, counterCode: "01" },
      { service: services[1], status: QueueStatus.CALLED, counterCode: "03" },
      { service: services[0], status: QueueStatus.WAITING },
      { service: services[2], status: QueueStatus.WAITING },
      { service: services[1], status: QueueStatus.WAITING },
    ];
    const sequenceByService = new Map<string, number>();
    for (const [index, record] of records.entries()) {
      const sequenceNumber = (sequenceByService.get(record.service.id) ?? 0) + 1;
      sequenceByService.set(record.service.id, sequenceNumber);
      const counter = record.counterCode
        ? await prisma.counter.findUnique({
            where: { branchId_code: { branchId: branch.id, code: record.counterCode } },
          })
        : null;
      const issuedAt = new Date(Date.now() - (index + 1) * 6 * 60_000);
      const queue = await prisma.queue.create({
        data: {
          businessId: business.id,
          branchId: branch.id,
          serviceId: record.service.id,
          customerId: customers[index].id,
          counterId: counter?.id,
          serviceDate: today,
          sequenceNumber,
          ticketNumber: `${record.service.code}-${String(sequenceNumber).padStart(3, "0")}`,
          status: record.status,
          issuedAt,
          calledAt: counter ? new Date(issuedAt.getTime() + 3 * 60_000) : null,
          startedAt: record.status === QueueStatus.SERVING ? new Date() : null,
        },
      });
      if (counter) {
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
    appUrl
      ? `Demo QR: ${appUrl}/q/${qrToken}`
      : `Demo QR token: ${qrToken} (set APP_URL untuk mencetak URL lengkap)`,
  );
  console.info(
    appUrl
      ? `Demo booking: ${appUrl}/book/${bookingToken}`
      : `Demo booking token: ${bookingToken} (set APP_URL untuk mencetak URL lengkap)`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Database seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
