import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sealApiKey, unsealApiKey } from "@/modules/billing/google-settings";

/**
 * Kredensial "Masuk dengan Google" milik platform, bukan milik satu bisnis:
 * redirect URI didaftarkan sekali di Google Cloud Console untuk seluruh
 * deployment. Disimpan terenkripsi di `PlatformSetting`, dengan environment
 * (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`) sebagai fallback agar deployment
 * lama tidak perlu mengisi ulang lewat konsol.
 */
const CLIENT_ID_KEY = "google.login.clientId";
const CLIENT_SECRET_KEY = "google.login.clientSecret";
const ENABLED_KEY = "google.login.enabled";

const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;
const CLIENT_SECRET_PATTERN = /^\S{8,255}$/;

export function validateGoogleClientId(value: string) {
  return CLIENT_ID_PATTERN.test(value);
}

export function validateGoogleClientSecret(value: string) {
  return CLIENT_SECRET_PATTERN.test(value);
}

export function maskGoogleClientSecret(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

async function storedCredentials() {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: [CLIENT_ID_KEY, CLIENT_SECRET_KEY] } },
    select: { key: true, value: true },
  });
  const clientId = rows.find((row) => row.key === CLIENT_ID_KEY)?.value ?? null;
  const sealed = rows.find((row) => row.key === CLIENT_SECRET_KEY)?.value ?? null;
  const clientSecret = sealed ? unsealApiKey(sealed) : null;
  if (!clientSecret) {
    if (sealed) console.warn("Google Client Secret tidak dapat didekripsi; periksa AUTH_SECRET.");
    return null;
  }
  return clientId ? { clientId, clientSecret } : null;
}

/**
 * Dipakai Auth.js saat membangun provider. Database dulu, environment kedua;
 * `null` berarti separuh kredensial hilang sehingga tombol Google disembunyikan
 * alih-alih gagal di callback.
 */
export async function readGoogleLoginCredentials() {
  const stored = await storedCredentials();
  if (stored) return stored;
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Sakelar aktif/nonaktif; tanpa baris tersimpan tombol tetap hidup (perilaku lama). */
export async function isGoogleLoginEnabled() {
  const row = await prisma.platformSetting.findUnique({
    where: { key: ENABLED_KEY },
    select: { value: true },
  });
  return row?.value !== "false";
}

export async function googleLoginStatus() {
  const [stored, enabled] = await Promise.all([readGoogleLoginCredentials(), isGoogleLoginEnabled()]);
  if (!stored) return { configured: false, source: null, clientId: null, masked: null, enabled: false };
  const source = (await storedCredentials()) ? ("website" as const) : ("environment" as const);
  return {
    configured: true,
    source,
    clientId: stored.clientId,
    masked: maskGoogleClientSecret(stored.clientSecret),
    enabled,
  };
}

export async function saveGoogleLoginCredentials(clientId: string, clientSecret: string) {
  await prisma.platformSetting.upsert({
    where: { key: CLIENT_ID_KEY },
    create: { key: CLIENT_ID_KEY, value: clientId },
    update: { value: clientId },
  });
  const sealed = sealApiKey(clientSecret);
  await prisma.platformSetting.upsert({
    where: { key: CLIENT_SECRET_KEY },
    create: { key: CLIENT_SECRET_KEY, value: sealed },
    update: { value: sealed },
  });
  await prisma.platformSetting.upsert({
    where: { key: ENABLED_KEY },
    create: { key: ENABLED_KEY, value: "true" },
    update: { value: "true" },
  });
  return googleLoginStatus();
}

export async function removeGoogleLoginCredentials() {
  await prisma.platformSetting.deleteMany({
    where: { key: { in: [CLIENT_ID_KEY, CLIENT_SECRET_KEY, ENABLED_KEY] } },
  });
  return googleLoginStatus();
}

export async function setGoogleLoginEnabled(enabled: boolean) {
  if (enabled && !(await readGoogleLoginCredentials())) {
    throw new Error("Kredensial Google belum dikonfigurasi.");
  }
  await prisma.platformSetting.upsert({
    where: { key: ENABLED_KEY },
    create: { key: ENABLED_KEY, value: enabled ? "true" : "false" },
    update: { value: enabled ? "true" : "false" },
  });
  return googleLoginStatus();
}

export const GoogleLoginInput = z.object({
  clientId: z.string().trim().refine(validateGoogleClientId, "Client ID harus diakhiri .apps.googleusercontent.com."),
  clientSecret: z.string().refine(validateGoogleClientSecret, "Client Secret tidak valid."),
});

export const GoogleLoginToggleInput = z.object({ enabled: z.boolean() });

export type GoogleLoginInput = z.infer<typeof GoogleLoginInput>;
export type GoogleLoginToggleInput = z.infer<typeof GoogleLoginToggleInput>;
