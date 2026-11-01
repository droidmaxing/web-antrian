import { prisma } from "@/lib/prisma";

/**
 * Menghapus satu bisnis beserta seluruh turunannya, untuk dipakai test yang
 * membuat data langsung lewat Prisma.
 *
 * Tanpa ini, tiap kali `npm test` dijalankan, bisnis/user/branch buatan test
 * menumpuk di DB dan akhirnya muncul di daftar dashboard orang lain. Urutannya
 * anak-dulu karena hampir semua relasi ke `Business` memakai `onDelete: Restrict`
 * (MySQL `foreign_key_checks` juga tidak bisa dimatikan dari Prisma), sehingga
 * `prisma.business.delete()` akan gagal selama anak-anaknya masih ada.
 */
export async function deleteBusinessTree(businessId: string) {
  const [branches, services] = await Promise.all([
    prisma.branch.findMany({ where: { businessId }, select: { id: true } }),
    prisma.service.findMany({ where: { businessId }, select: { id: true } }),
  ]);
  const branchIds = branches.map((row) => row.id);
  const serviceIds = services.map((row) => row.id);
  const queues = await prisma.queue.findMany({ where: { businessId }, select: { id: true } });
  const queueIds = queues.map((row) => row.id);

  await prisma.queueHistory.deleteMany({ where: { queueId: { in: queueIds } } });
  await prisma.accessToken.deleteMany({ where: { businessId } });
  await prisma.notification.deleteMany({ where: { businessId } });
  await prisma.outboxEvent.deleteMany({ where: { businessId } });
  await prisma.bookingSlot.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.queue.deleteMany({ where: { businessId } });
  await prisma.booking.deleteMany({ where: { businessId } });
  await prisma.display.deleteMany({ where: { businessId } });
  await prisma.counter.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.customer.deleteMany({ where: { businessId } });
  await prisma.queueSequence.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.branch.deleteMany({ where: { businessId } });
  await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
  await prisma.payment.deleteMany({ where: { businessId } });
  await prisma.auditLog.deleteMany({ where: { businessId } });
  await prisma.businessMembership.deleteMany({ where: { businessId } });
  await prisma.business.deleteMany({ where: { id: businessId } });
}

/*
 * Test yang menulis langsung lewat Prisma mendaftarkan barisnya di sini, lalu
 * satu `test.after(cleanupTracked)` di akhir file menghapus semuanya. Tanpa itu
 * tiap `npm test` meninggalkan bisnis/user baru di DB dev yang ikut tampil di
 * dashboard.
 */
const trackedBusinesses: string[] = [];
const trackedUsers: string[] = [];

export function trackBusiness<T extends { id: string }>(row: T): T {
  trackedBusinesses.push(row.id);
  return row;
}

export function trackUser<T extends { id: string }>(row: T): T {
  trackedUsers.push(row.id);
  return row;
}

export async function cleanupTracked() {
  const businesses = trackedBusinesses.splice(0);
  const users = trackedUsers.splice(0);
  for (const id of businesses) await deleteBusinessTree(id);
  // Baris membership/audit milik user sudah hilang bersama bisnisnya (ON DELETE
  // CASCADE), sisanya Session/Account juga cascade, jadi user bisa dihapus telak.
  if (users.length) await prisma.user.deleteMany({ where: { id: { in: users } } });
}
