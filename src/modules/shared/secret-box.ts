import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Enkripsi kredensial platform (Google Client Secret dan sejenisnya) memakai
 * AUTH_SECRET. BOX_INFO ikut menentukan kunci turunan: mengubah nilainya membuat
 * kredensial yang sudah tersimpan tidak bisa didekripsi lagi.
 */
const BOX_INFO = "web-antrian:google-api-key:v1";

function encryptionKey(authSecret: string) {
  if (authSecret.length < 32) {
    throw new Error("AUTH_SECRET harus berisi minimal 32 karakter untuk mengenkripsi kredensial.");
  }
  return Buffer.from(hkdfSync("sha256", authSecret, "web-antrian", BOX_INFO, 32));
}

export function sealSecret(value: string, authSecret = process.env.AUTH_SECRET ?? "") {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(authSecret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ciphertext.toString("base64")}`;
}

export function unsealSecret(value: string, authSecret = process.env.AUTH_SECRET ?? ""): string | null {
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
