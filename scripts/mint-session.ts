/**
 * Cetak token sesi untuk uji browser TANPA mengetik kredensial apa pun.
 * Memakai AUTH_SECRET + format JWT next-auth (strategi "jwt"), sama seperti
 * cookie yang dibuat proses login sungguhan.
 *
 *   AUTH_SECRET=... npx tsx scripts/mint-session.ts
 */
import { encode } from "next-auth/jwt";
import { prisma } from "../src/lib/prisma";

async function main() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET tidak diset");
  const role = (process.env.ROLE ?? "OWNER") as "OWNER" | "SUPER_ADMIN" | "ADMIN";
  const owner = await prisma.businessMembership.findFirst({
    where: { role, business: { active: true } },
    include: { business: { select: { slug: true } }, user: { select: { id: true, email: true } } },
  });
  if (!owner) throw new Error(`Tidak ada ${role} aktif`);
  const token = await encode({
    secret,
    salt: "authjs.session-token",
    token: { sub: owner.user.id, email: owner.user.email, name: owner.user.email },
  });
  // Token sesi adalah kredensial — jangan cetak; hanya tulis ke file sementara.
  const { writeFileSync } = await import("node:fs");
  writeFileSync(process.env.TOKEN_OUT ?? "/tmp/session_token.txt", token);
  if (!owner.user.email) throw new Error(`${role} tanpa email`);
  console.log(`Sesi dibuat untuk ${role} (${owner.user.email.replace(/(.{2}).*(@.*)/, "$1***$2")}).`);
  console.log(`Slug bisnis: ${owner.business.slug}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
