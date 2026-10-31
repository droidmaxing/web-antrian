import { MembershipRole } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/modules/shared/errors";
import { isSubscriptionAllowed } from "@/modules/billing/billing-domain";

export type BusinessContext = {
  userId: string;
  businessId: string;
  businessSlug: string;
  role: MembershipRole;
  branchIds: string[] | null;
  /**
   * Counters this user is allowed to operate. `null` means unrestricted, which
   * is what every account that predates the CounterMember table gets — so
   * turning the feature on never locks an existing operator out.
   */
  counterIds: string[] | null;
};

export async function requireBusinessContext(
  businessSlug: string,
  branchId?: string,
  options: { allowInactiveSubscription?: boolean } = {},
): Promise<BusinessContext> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AppError("Silakan masuk untuk melanjutkan.", 401, "UNAUTHENTICATED");
  }

  const activeUser = await prisma.user.findFirst({
    where: { id: session.user.id, active: true },
    select: { id: true },
  });
  if (!activeUser) {
    throw new AppError("Akun sudah tidak aktif.", 401, "UNAUTHENTICATED");
  }

  const membership = await prisma.businessMembership.findFirst({
    where: {
      userId: session.user.id,
      business: { slug: businessSlug, active: true },
    },
    include: {
      business: { select: { id: true, slug: true } },
      branchScopes: { select: { branchId: true } },
      counterScopes: { select: { counterId: true } },
    },
  });

  if (!membership) {
    throw new AppError("Akses ke bisnis ini tidak diizinkan.", 403, "FORBIDDEN");
  }

  // Existing businesses without a subscription row predate billing and remain
  // usable. When a row exists, only the owner can reach the renewal screen.
  const subscription = await prisma.subscription.findUnique({
    where: { businessId: membership.business.id },
    select: { status: true, trialEndsAt: true, currentPeriodEnd: true },
  });
  if (
    subscription &&
    !isSubscriptionAllowed(
      subscription.status,
      subscription.currentPeriodEnd ?? subscription.trialEndsAt,
    ) &&
    !(options.allowInactiveSubscription && membership.role === "OWNER")
  ) {
    throw new AppError("Langganan workspace tidak aktif. Hubungi pemilik workspace.", 402, "SUBSCRIPTION_REQUIRED");
  }

  const branchIds =
    membership.role === "OWNER" || membership.role === "SUPER_ADMIN"
      ? null
      : membership.branchScopes.map((scope) => scope.branchId);

  // Owners and super admins oversee everything; everyone else can only be
  // bound to specific counters, and an empty scope list still means "all".
  const counterIds =
    membership.role === "OWNER" || membership.role === "SUPER_ADMIN"
      ? null
      : membership.counterScopes.length
        ? membership.counterScopes.map((scope) => scope.counterId)
        : null;

  if (branchId) {
    const multiBranch = await prisma.featureConfiguration.findUnique({
      where: {
        businessId_featureKey: {
          businessId: membership.business.id,
          featureKey: "MULTI_BRANCH",
        },
      },
      select: { enabled: true },
    });
    const defaultBranch = !multiBranch?.enabled
      ? await prisma.branch.findFirst({
          where: { businessId: membership.business.id, active: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true },
        })
      : null;
    if (defaultBranch && defaultBranch.id !== branchId) {
      throw new AppError("Fitur multi cabang belum aktif.", 404, "BRANCH_NOT_FOUND");
    }
    const branch = await prisma.branch.findFirst({
      where: {
        id: branchId,
        businessId: membership.business.id,
        active: true,
        ...(branchIds ? { id: { in: branchIds } } : {}),
      },
      select: { id: true },
    });
    if (!branch) {
      throw new AppError("Cabang tidak ditemukan.", 404, "BRANCH_NOT_FOUND");
    }
  }

  return {
    userId: session.user.id,
    businessId: membership.business.id,
    businessSlug: membership.business.slug,
    role: membership.role,
    branchIds,
    counterIds,
  };
}

/**
 * OWNER is the highest role in a tenant: it implicitly satisfies every role
 * requirement, including SUPER_ADMIN and operator-level lists. Without this
 * expansion the business owner — the person who created the workspace — could
 * not add or edit services, counters, branches, the team, or display settings,
 * which made the whole management UI look read-only.
 */
export function requireRole(
  context: BusinessContext,
  roles: MembershipRole[],
) {
  if (roles.includes(context.role)) return;
  if (context.role === "OWNER") return;
  throw new AppError("Anda tidak memiliki izin untuk tindakan ini.", 403, "FORBIDDEN");
}
