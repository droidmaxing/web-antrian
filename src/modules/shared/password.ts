import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";

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
