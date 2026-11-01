import { FeatureKey } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/modules/shared/errors";

export async function requireFeature(businessId: string, featureKey: FeatureKey) {
  const configuration = await prisma.featureConfiguration.findUnique({
    where: { businessId_featureKey: { businessId, featureKey } },
    select: { enabled: true },
  });

  if (!configuration?.enabled) {
    throw new AppError(
      "Fitur ini belum diaktifkan untuk bisnis Anda.",
      404,
      "FEATURE_DISABLED",
    );
  }
}

/** Cek tanpa melempar: dipakai untuk mengubah perilaku form (mis. NIK wajib). */
export async function isFeatureEnabled(businessId: string, featureKey: FeatureKey) {
  const configuration = await prisma.featureConfiguration.findUnique({
    where: { businessId_featureKey: { businessId, featureKey } },
    select: { enabled: true },
  });
  return Boolean(configuration?.enabled);
}
