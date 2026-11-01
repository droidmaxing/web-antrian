import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/modules/shared/errors";

export type MidtransMode = "sandbox" | "production";

/** Satu slot kunci per mode: beralih mode tidak menghapus kunci mode lain. */
const KEY_SETTING: Record<MidtransMode, string> = {
  sandbox: "midtrans.serverKey",
  production: "midtrans.productionServerKey",
};
const MODE_KEY = "midtrans.mode";
const ENABLED_KEY = "midtrans.enabled";
const ENV_VAR: Record<MidtransMode, string> = {
  sandbox: "MIDTRANS_SERVER_KEY",
  production: "MIDTRANS_PRODUCTION_SERVER_KEY",
};
const BOX_INFO = "web-antrian:midtrans-server-key:v1";

function encryptionKey(authSecret: string) {
  if (authSecret.length < 32) {
    throw new AppError("AUTH_SECRET harus berisi minimal 32 karakter untuk mengenkripsi kredensial.", 500, "SECRET_BOX_UNCONFIGURED");
  }
  return Buffer.from(hkdfSync("sha256", authSecret, "web-antrian", BOX_INFO, 32));
}

export function sealServerKey(value: string, authSecret = process.env.AUTH_SECRET ?? "") {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(authSecret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ciphertext.toString("base64")}`;
}

export function unsealServerKey(value: string, authSecret = process.env.AUTH_SECRET ?? ""): string | null {
  const [version, ivText, tagText, ciphertextText] = value.split(":");
  if (version !== "v1" || !ivText || !tagText || !ciphertextText) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(authSecret), Buffer.from(ivText, "base64"));
    decipher.setAuthTag(Buffer.from(tagText, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Midtrans memakai awalan berbeda per lingkungan; kunci salah lingkungan baru gagal saat pembayaran pertama. */
const KEY_PREFIX: Record<MidtransMode, RegExp> = {
  sandbox: /^SB-Mid-server-[A-Za-z0-9_-]{16,180}$/,
  production: /^Mid-server-[A-Za-z0-9_-]{16,180}$/,
};

export function validateServerKey(value: string, mode: MidtransMode) {
  return KEY_PREFIX[mode].test(value.trim());
}

export function validateSandboxServerKey(value: string) {
  return validateServerKey(value, "sandbox");
}

export function maskServerKey(value: string) {
  return `${value.slice(0, 14)}…${value.slice(-4)}`;
}

const UNREADABLE = "unreadable" as const;

async function storedServerKey(mode: MidtransMode) {
  const row = await prisma.platformSetting.findUnique({ where: { key: KEY_SETTING[mode] }, select: { value: true } });
  if (!row) return null;
  const key = unsealServerKey(row.value)?.trim();
  if (!key) {
    // Kunci ada tapi tidak bisa dibuka (AUTH_SECRET berubah) — jangan laporkan sebagai "belum diatur".
    console.warn(`Midtrans ${mode} server key tidak dapat didekripsi; periksa AUTH_SECRET.`);
    return UNREADABLE;
  }
  return key;
}

export async function readMidtransServerKey(mode: MidtransMode): Promise<string | null> {
  const stored = await storedServerKey(mode);
  if (stored === UNREADABLE) return null;
  if (stored) return stored;
  const environment = process.env[ENV_VAR[mode]]?.trim();
  return environment && validateServerKey(environment, mode) ? environment : null;
}

export type MidtransKeyStatus = {
  configured: boolean;
  source: "website" | "environment" | null;
  masked: string | null;
  /** Kunci tersimpan tetapi tidak terbaca lagi, biasanya karena AUTH_SECRET berubah. */
  unreadable?: boolean;
};

export async function midtransServerKeyStatus(mode: MidtransMode): Promise<MidtransKeyStatus> {
  const stored = await storedServerKey(mode);
  if (stored === UNREADABLE) return { configured: false, source: "website", masked: null, unreadable: true };
  if (stored) return { configured: true, source: "website", masked: maskServerKey(stored) };
  const environment = process.env[ENV_VAR[mode]]?.trim();
  return environment && validateServerKey(environment, mode)
    ? { configured: true, source: "environment", masked: maskServerKey(environment) }
    : { configured: false, source: null, masked: null };
}

export async function saveMidtransServerKey(value: string, mode: MidtransMode) {
  const key = value.trim();
  if (!validateServerKey(key, mode)) {
    throw new AppError(
      mode === "sandbox"
        ? "Server Key sandbox Midtrans harus diawali SB-Mid-server-."
        : "Server Key produksi Midtrans harus diawali Mid-server-.",
      400,
      "INVALID_SERVER_KEY",
    );
  }
  const encrypted = sealServerKey(key);
  await prisma.platformSetting.upsert({
    where: { key: KEY_SETTING[mode] },
    create: { key: KEY_SETTING[mode], value: encrypted },
    update: { value: encrypted },
  });
  return midtransServerKeyStatus(mode);
}

export async function removeMidtransServerKey(mode: MidtransMode) {
  await prisma.platformSetting.deleteMany({ where: { key: KEY_SETTING[mode] } });
  return midtransServerKeyStatus(mode);
}

export async function readMidtransMode(): Promise<MidtransMode> {
  const row = await prisma.platformSetting.findUnique({ where: { key: MODE_KEY }, select: { value: true } });
  return row?.value === "production" ? "production" : "sandbox";
}

export async function saveMidtransMode(mode: MidtransMode) {
  await prisma.platformSetting.upsert({
    where: { key: MODE_KEY },
    create: { key: MODE_KEY, value: mode },
    update: { value: mode },
  });
  return readMidtransMode();
}

/** Sakelar besar untuk mematikan pembayaran online tanpa menghapus kunci. Baris hilang = aktif. */
export async function readMidtransEnabled() {
  const row = await prisma.platformSetting.findUnique({ where: { key: ENABLED_KEY }, select: { value: true } });
  return row?.value !== "false";
}

export async function saveMidtransEnabled(enabled: boolean) {
  const value = enabled ? "true" : "false";
  await prisma.platformSetting.upsert({
    where: { key: ENABLED_KEY },
    create: { key: ENABLED_KEY, value },
    update: { value },
  });
  return readMidtransEnabled();
}
