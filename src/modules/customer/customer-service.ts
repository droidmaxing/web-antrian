import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/modules/shared/errors";
import { auditData } from "@/modules/shared/audit";
import { BusinessContext, requireRole } from "@/modules/tenancy/context";

/**
 * Customer directory for a tenant.
 *
 * The `Customer` table already existed (created implicitly whenever a visitor
 * took a ticket or booked a slot) but there was no way to list, add or edit
 * those records from the dashboard. This module is that missing layer.
 */

const MANAGE_ROLES = ["OWNER", "SUPER_ADMIN"] as const;
const READ_ROLES = ["OWNER", "SUPER_ADMIN", "ADMIN"] as const;

export type CustomerInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
};

export type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  queueCount: number;
  bookingCount: number;
  lastVisitAt: string | null;
  lastServiceName: string | null;
};

/** Digits only, Indonesian country code normalised to a leading 0. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return "";
  let value = digits.replace(/^\+/, "");
  if (value.startsWith("62")) value = `0${value.slice(2)}`;
  return value.replace(/\D/g, "");
}

function assertPhone(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = normalizePhone(trimmed);
  if (!/^\d{6,15}$/.test(normalized)) {
    throw new AppError(
      "Nomor telepon tidak valid. Gunakan 08xx atau +62.",
      400,
      "INVALID_PHONE",
      { phone: "Gunakan 6–15 digit, misalnya 08123456789." },
    );
  }
  return normalized;
}

function assertEmail(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
    throw new AppError("Format email tidak valid.", 400, "INVALID_EMAIL", {
      email: "Tulis alamat email lengkap, misalnya nama@contoh.com.",
    });
  }
  return trimmed;
}

function assertName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) {
    throw new AppError(
      "Nama pelanggan harus 2–80 karakter.",
      400,
      "INVALID_NAME",
      { name: "Nama pelanggan" },
    );
  }
  return name;
}

async function assertUniqueContact(
  businessId: string,
  phone: string | null,
  email: string | null,
  excludeId?: string,
) {
  if (phone) {
    const clash = await prisma.customer.findFirst({
      where: {
        businessId,
        phone,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, name: true },
    });
    if (clash) {
      throw new AppError(
        `Nomor telepon sudah dipakai pelanggan lain (${clash.name}).`,
        409,
        "DUPLICATE_PHONE",
        { phone: `Nomor telepon sudah dipakai oleh ${clash.name}.` },
      );
    }
  }
  if (email) {
    const clash = await prisma.customer.findFirst({
      where: {
        businessId,
        email,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, name: true },
    });
    if (clash) {
      throw new AppError(
        `Email sudah dipakai pelanggan lain (${clash.name}).`,
        409,
        "DUPLICATE_EMAIL",
        { email: `Email sudah dipakai oleh ${clash.name}.` },
      );
    }
  }
}

export async function listCustomers(
  context: BusinessContext,
  options: { query?: string; limit?: number } = {},
): Promise<CustomerRow[]> {
  requireRole(context, [...READ_ROLES]);
  const query = options.query?.trim() ?? "";
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);

  const where: Prisma.CustomerWhereInput = {
    businessId: context.businessId,
    ...(query
      ? {
          OR: [
            { name: { contains: query } },
            { phone: { contains: normalizePhone(query) || query } },
            { email: { contains: query.toLowerCase() } },
          ],
        }
      : {}),
  };

  const customers = await prisma.customer.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    take: limit,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { queues: true, bookings: true } },
      queues: {
        orderBy: { issuedAt: "desc" },
        take: 1,
        select: { issuedAt: true, service: { select: { name: true } } },
      },
    },
  });

  return customers.map(({ _count, queues, ...customer }) => ({
    ...customer,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
    queueCount: _count.queues,
    bookingCount: _count.bookings,
    lastVisitAt: queues[0]?.issuedAt.toISOString() ?? null,
    lastServiceName: queues[0]?.service.name ?? null,
  }));
}

export async function createCustomer(context: BusinessContext, input: CustomerInput) {
  requireRole(context, [...MANAGE_ROLES]);
  const name = assertName(input.name);
  const phone = assertPhone(input.phone);
  const email = assertEmail(input.email);
  await assertUniqueContact(context.businessId, phone, email);

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: { businessId: context.businessId, name, phone, email },
    });
    await tx.auditLog.create({
      data: auditData({
        businessId: context.businessId,
        actorUserId: context.userId,
        action: "CUSTOMER_CREATED",
        targetType: "Customer",
        targetId: customer.id,
        metadata: { name: customer.name, hasPhone: Boolean(phone) },
      }),
    });
    return customer;
  });
}

export async function updateCustomer(
  context: BusinessContext,
  customerId: string,
  input: Partial<CustomerInput>,
) {
  requireRole(context, [...MANAGE_ROLES]);
  const existing = await prisma.customer.findFirst({
    where: { id: customerId, businessId: context.businessId },
    select: { id: true, phone: true, email: true },
  });
  if (!existing) throw new AppError("Pelanggan tidak ditemukan.", 404, "CUSTOMER_NOT_FOUND");

  const name = input.name === undefined ? undefined : assertName(input.name);
  const phone = input.phone === undefined ? undefined : assertPhone(input.phone);
  const email = input.email === undefined ? undefined : assertEmail(input.email);
  await assertUniqueContact(
    context.businessId,
    phone === undefined ? null : phone,
    email === undefined ? null : email,
    customerId,
  );

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.update({
      where: { id: customerId },
      data: {
        ...(name === undefined ? {} : { name }),
        ...(phone === undefined ? {} : { phone }),
        ...(email === undefined ? {} : { email }),
      },
    });
    await tx.auditLog.create({
      data: auditData({
        businessId: context.businessId,
        actorUserId: context.userId,
        action: "CUSTOMER_UPDATED",
        targetType: "Customer",
        targetId: customer.id,
        metadata: { changed: Object.keys(input) },
      }),
    });
    return customer;
  });
}

/**
 * Customers with queue or booking history are never deleted: those rows carry
 * reporting data. Deleting them is refused with an explicit code so the UI can
 * explain why instead of failing silently.
 */
export async function deleteCustomer(context: BusinessContext, customerId: string) {
  requireRole(context, [...MANAGE_ROLES]);
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId: context.businessId },
    include: { _count: { select: { queues: true, bookings: true } } },
  });
  if (!customer) throw new AppError("Pelanggan tidak ditemukan.", 404, "CUSTOMER_NOT_FOUND");

  if (customer._count.queues > 0 || customer._count.bookings > 0) {
    throw new AppError(
      "Pelanggan ini punya riwayat antrean atau booking, jadi tidak bisa dihapus. Kosongkan kontaknya lewat Edit bila sudah tidak dipakai.",
      409,
      "CUSTOMER_HAS_HISTORY",
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.customer.delete({ where: { id: customer.id } });
    await tx.auditLog.create({
      data: auditData({
        businessId: context.businessId,
        actorUserId: context.userId,
        action: "CUSTOMER_DELETED",
        targetType: "Customer",
        targetId: customer.id,
        metadata: { name: customer.name },
      }),
    });
    return { id: customer.id };
  });
}
