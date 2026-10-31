import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/modules/shared/errors";
import { z } from "zod";

const SETTING_KEY = "google.apiKey";
const ENABLED_KEY = "google.apiKey.enabled";
const BOX_INFO = "web-antrian:google-api-key:v1";

function encryptionKey(authSecret: string) {
  if (authSecret.length < 32) {
    throw new AppError("AUTH_SECRET harus berisi minimal 32 karakter untuk mengenkripsi kredensial.", 500, "SECRET_BOX_UNCONFIGURED");
  }
  return Buffer.from(hkdfSync("sha256", authSecret, "web-antrian", BOX_INFO, 32));
}

export function sealApiKey(value: string, authSecret = process.env.AUTH_SECRET ?? "") {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(authSecret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ciphertext.toString("base64")}`;
}

export function unsealApiKey(value: string, authSecret = process.env.AUTH_SECRET ?? ""): string | null {
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

export function validateGoogleApiKey(value: string) {
  return /^[A-Za-z0-9_-]{40,255}$/.test(value);
}

export function maskApiKey(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-4)}`;
}

async function storedApiKey() {
  const row = await prisma.platformSetting.findUnique({ where: { key: SETTING_KEY }, select: { value: true } });
  if (!row) return null;
  const key = unsealApiKey(row.value);
  if (!key) console.warn("Google API key tidak dapat didekripsi; periksa AUTH_SECRET.");
  return key;
}

export async function readGoogleApiKey() {
  const stored = await storedApiKey();
  if (stored) return stored;
  const environment = process.env.GOOGLE_API_KEY?.trim();
  return environment && validateGoogleApiKey(environment) ? environment : null;
}

export async function isGoogleApiKeyEnabled() {
  const row = await prisma.platformSetting.findUnique({ where: { key: ENABLED_KEY }, select: { value: true } });
  return row?.value === "true";
}

export async function googleApiKeyStatus() {
  const stored = await storedApiKey();
  const enabled = await isGoogleApiKeyEnabled();
  if (stored) return { configured: true, source: "website" as const, masked: maskApiKey(stored), enabled };
  const environment = process.env.GOOGLE_API_KEY?.trim();
  return environment && validateGoogleApiKey(environment)
    ? { configured: true, source: "environment" as const, masked: maskApiKey(environment), enabled }
    : { configured: false, source: null, masked: null, enabled };
}

export async function saveGoogleApiKey(value: string) {
  const encrypted = sealApiKey(value);
  await prisma.platformSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: encrypted },
    update: { value: encrypted },
  });
  return googleApiKeyStatus();
}

export async function removeGoogleApiKey() {
  await prisma.platformSetting.deleteMany({ where: { key: SETTING_KEY } });
  await prisma.platformSetting.deleteMany({ where: { key: ENABLED_KEY } });
  return googleApiKeyStatus();
}

export async function setGoogleApiKeyEnabled(enabled: boolean) {
  const stored = await storedApiKey();
  if (!stored) throw new AppError("Google API key belum dikonfigurasi.", 400, "GOOGLE_API_KEY_NOT_CONFIGURED");
  await prisma.platformSetting.upsert({
    where: { key: ENABLED_KEY },
    create: { key: ENABLED_KEY, value: enabled ? "true" : "false" },
    update: { value: enabled ? "true" : "false" },
  });
  return googleApiKeyStatus();
}

export const GoogleApiKeyInput = z.object({
  apiKey: z.string().min(1, "API key wajib diisi").refine(validateGoogleApiKey, "Format Google API key tidak valid."),
});

export const GoogleApiKeyToggleInput = z.object({
  enabled: z.boolean(),
});

export type GoogleApiKeyInput = z.infer<typeof GoogleApiKeyInput>;
export type GoogleApiKeyToggleInput = z.infer<typeof GoogleApiKeyToggleInput>;
