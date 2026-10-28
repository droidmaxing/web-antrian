import { prisma } from "@/lib/prisma";
import { auditData } from "@/modules/shared/audit";
import { AppError } from "@/modules/shared/errors";
import { BusinessContext, requireRole } from "@/modules/tenancy/context";
import {
  BrandTheme,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_THEME,
  LOGO_MAX_LENGTH,
  LogoMimeType,
  normalizeHexColor,
} from "@/modules/tenancy/brand";

export type ThemeInput = {
  primaryColor?: string;
  /** undefined keeps the current logo, null removes it, a data URL replaces it. */
  logo?: string | null;
};

export type LogoUpload = { mimeType: LogoMimeType; data: string };

const IMAGE_SIGNATURES: { mime: LogoMimeType; bytes: number[] }[] = [
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] },
];

/** The declared MIME type comes from the browser, so confirm it against the magic bytes. */
function sniffLogoMimeType(buffer: Buffer): LogoMimeType | null {
  const match = IMAGE_SIGNATURES.find((signature) =>
    signature.bytes.every((byte, index) => buffer[index] === byte),
  );
  if (!match) return null;
  if (match.mime === "image/webp" && buffer.subarray(8, 12).toString("ascii") !== "WEBP") {
    return null;
  }
  return match.mime;
}

function invalidLogo(message: string, code: string) {
  return new AppError(message, 400, code);
}

/**
 * Validates a logo `data:` URL from the settings form: allowed image type, size
 * limit, and a body whose magic bytes match the declared type.
 */
export function parseLogoUpload(value: unknown): LogoUpload {
  if (typeof value !== "string") {
    throw invalidLogo("Format logo tidak dikenali.", "INVALID_LOGO");
  }
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]*)$/.exec(value.trim());
  if (!match) {
    throw invalidLogo("Logo harus berupa berkas PNG, JPEG, atau WebP.", "INVALID_LOGO");
  }
  const [, declaredMime, data] = match;
  if (data.length === 0) {
    throw invalidLogo("Berkas logo kosong.", "INVALID_LOGO");
  }
  if (data.length > LOGO_MAX_LENGTH) {
    throw invalidLogo(
      `Logo terlalu besar. Maksimal ${Math.round(LOGO_MAX_LENGTH / 1000)} KB.`,
      "LOGO_TOO_LARGE",
    );
  }
  const sniffed = sniffLogoMimeType(Buffer.from(data, "base64"));
  if (!sniffed || sniffed !== declaredMime) {
    throw invalidLogo(
      "Isi berkas tidak cocok dengan tipe gambarnya. Unggah ulang sebagai PNG, JPEG, atau WebP.",
      "INVALID_LOGO",
    );
  }
  return { mimeType: sniffed, data };
}

function toTheme(row: {
  primaryColor: string;
  logoMimeType: string | null;
  logoData: string | null;
} | null): BrandTheme {
  if (!row) return DEFAULT_THEME;
  return {
    primaryColor: row.primaryColor,
    logoMimeType: row.logoMimeType,
    logoData: row.logoData,
  };
}

const THEME_FIELDS = {
  primaryColor: true,
  logoMimeType: true,
  logoData: true,
} as const;

export async function getTheme(businessId: string): Promise<BrandTheme> {
  return toTheme(
    await prisma.businessTheme.findUnique({
      where: { businessId },
      select: THEME_FIELDS,
    }),
  );
}

/** Batch lookup for pages that render several businesses at once. */
export async function getThemes(businessIds: string[]): Promise<Map<string, BrandTheme>> {
  if (businessIds.length === 0) return new Map();
  const rows = await prisma.businessTheme.findMany({
    where: { businessId: { in: businessIds } },
    select: { businessId: true, ...THEME_FIELDS },
  });
  return new Map(rows.map((row) => [row.businessId, toTheme(row)]));
}

/**
 * Workspace branding is a Super Admin (and Owner) setting: the check lives here
 * so both the API route and any future caller are covered.
 */
export async function updateTheme(
  context: BusinessContext,
  input: ThemeInput,
): Promise<BrandTheme> {
  requireRole(context, ["SUPER_ADMIN"]);
  const primaryColor = normalizeHexColor(input.primaryColor ?? DEFAULT_PRIMARY_COLOR);
  const logo = input.logo === undefined ? undefined : input.logo === null ? null : parseLogoUpload(input.logo);

  return await prisma.$transaction(async (tx) => {
    const data = {
      primaryColor,
      ...(logo === undefined
        ? {}
        : { logoMimeType: logo?.mimeType ?? null, logoData: logo?.data ?? null }),
    };
    const row = await tx.businessTheme.upsert({
      where: { businessId: context.businessId },
      update: data,
      create: { businessId: context.businessId, ...data },
      select: THEME_FIELDS,
    });
    await tx.auditLog.create({
      data: auditData({
        businessId: context.businessId,
        actorUserId: context.userId,
        action: "THEME_UPDATED",
        targetType: "BusinessTheme",
        targetId: context.businessId,
        metadata: {
          primaryColor,
          logo: logo === undefined ? "unchanged" : logo === null ? "removed" : logo.mimeType,
        },
      }),
    });
    return toTheme(row);
  });
}

/** Restores the shipped colours and removes the logo. */
export async function resetTheme(context: BusinessContext): Promise<BrandTheme> {
  requireRole(context, ["SUPER_ADMIN"]);
  const existing = await prisma.businessTheme.findUnique({
    where: { businessId: context.businessId },
    select: { businessId: true },
  });
  if (!existing) return DEFAULT_THEME;
  await prisma.$transaction(async (tx) => {
    await tx.businessTheme.delete({ where: { businessId: context.businessId } });
    await tx.auditLog.create({
      data: auditData({
        businessId: context.businessId,
        actorUserId: context.userId,
        action: "THEME_RESET",
        targetType: "BusinessTheme",
        targetId: context.businessId,
      }),
    });
  });
  return DEFAULT_THEME;
}
