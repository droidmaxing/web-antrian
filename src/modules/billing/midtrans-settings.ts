import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/modules/shared/errors";

const SETTING_KEY = "midtrans.serverKey";
const MODE_KEY = "midtrans.mode";
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

export function validateSandboxServerKey(value: string) {
  return /^SB-Mid-server-[A-Za-z0-9_-]{16,180}$/.test(value);
}

export function maskServerKey(value: string) {
  return `${value.slice(0, 14)}…${value.slice(-4)}`;
}

async function storedServerKey() {
  const row = await prisma.platformSetting.findUnique({ where: { key: SETTING_KEY }, select: { value: true } });
  if (!row) return null;
  const key = unsealServerKey(row.value);
  if (!key) console.warn("Midtrans server key tidak dapat didekripsi; periksa AUTH_SECRET.");
  return key;
}

export async function readMidtransServerKey() {
  const stored = await storedServerKey();
  if (stored) return stored;
  const environment = process.env.MIDTRANS_SERVER_KEY?.trim();
  return environment && validateSandboxServerKey(environment) ? environment : null;
}

export async function midtransServerKeyStatus() {
  const stored = await storedServerKey();
  if (stored) return { configured: true, source: "website" as const, masked: maskServerKey(stored) };
  const environment = process.env.MIDTRANS_SERVER_KEY?.trim();
  return environment && validateSandboxServerKey(environment)
    ? { configured: true, source: "environment" as const, masked: maskServerKey(environment) }
    : { configured: false, source: null, masked: null };
}

export async function saveMidtransServerKey(value: string) {
  const encrypted = sealServerKey(value);
  await prisma.platformSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: encrypted },
    update: { value: encrypted },
  });
  return midtransServerKeyStatus();
}

export async function removeMidtransServerKey() {
  await prisma.platformSetting.deleteMany({ where: { key: SETTING_KEY } });
  return midtransServerKeyStatus();
}

export async function readMidtransMode(): Promise<"sandbox" | "production"> {
  const row = await prisma.platformSetting.findUnique({ where: { key: MODE_KEY }, select: { value: true } });
  return row?.value === "production" ? "production" : "sandbox";
}

export async function saveMidtransMode(mode: "sandbox" | "production") {
  await prisma.platformSetting.upsert({
    where: { key: MODE_KEY },
    create: { key: MODE_KEY, value: mode },
    update: { value: mode },
  });
  return readMidtransMode();
}
