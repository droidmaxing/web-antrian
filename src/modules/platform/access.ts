import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/modules/shared/errors";

/**
 * Platform authority lives on `User.platformRole`, not on a tenant membership:
 * a Master Admin belongs to no business but can see every business. It is
 * deliberately separate from `requireBusinessContext` so the console can never
 * be reached through a tenant slug.
 */
export async function requirePlatformAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AppError("Silakan masuk untuk melanjutkan.", 401, "UNAUTHENTICATED");
  }
  const user = await prisma.user.findFirst({
    where: { id: session.user.id, active: true, platformRole: "MASTER_ADMIN" },
    select: { id: true, name: true, email: true },
  });
  if (!user) {
    throw new AppError("Halaman ini hanya untuk Master Admin.", 403, "FORBIDDEN");
  }
  return user;
}
