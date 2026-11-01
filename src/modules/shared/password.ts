import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { z } from "zod";

/**
 * Sandi sementara yang dibuat sistem (dipakai alur undang anggota dan reset
 * sandi). Nilai aslinya hanya ditampilkan sekali; yang disimpan cuma hash-nya.
 */
export function temporaryPassword(): string {
  return `Antrian-${randomBytes(6).toString("base64url")}`;
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, 12);
}

/**
 * Bentuk permintaan ganti sandi akun sendiri. Dipisah dari route-nya supaya
 * aturan panjang sandi bisa diuji tanpa memuat Auth.js.
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});
