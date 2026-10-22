import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { MembershipRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/modules/shared/errors";
import { auditData } from "@/modules/shared/audit";
import { BusinessContext, requireRole } from "@/modules/tenancy/context";

const MANAGE_ROLES: MembershipRole[] = ["OWNER", "SUPER_ADMIN"];

export type TeamMemberRow = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: MembershipRole;
  active: boolean;
  branchIds: string[];
  counterIds: string[];
  joinedAt: string;
};

export async function listTeam(context: BusinessContext): Promise<TeamMemberRow[]> {
  requireRole(context, [...MANAGE_ROLES]);
  const memberships = await prisma.businessMembership.findMany({
    where: { businessId: context.businessId },
    include: {
      user: { select: { id: true, name: true, email: true, active: true } },
      branchScopes: { select: { branchId: true } },
      counterScopes: { select: { counterId: true } },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  return memberships.map((membership) => ({
    membershipId: membership.id,
    userId: membership.user.id,
    name: membership.user.name ?? membership.user.email ?? "Pengguna",
    email: membership.user.email ?? "",
    role: membership.role,
    active: membership.user.active,
    branchIds: membership.branchScopes.map((scope) => scope.branchId),
    counterIds: membership.counterScopes.map((scope) => scope.counterId),
    joinedAt: membership.createdAt.toISOString(),
  }));
}

/**
 * Counter scopes only make sense for counters that live inside the business.
 * Validating here keeps a stale or hand-crafted request from silently locking
 * an operator out of every counter.
 */
async function assertCountersBelongToBusiness(
  businessId: string,
  counterIds: string[],
) {
  if (!counterIds.length) return;
  const counters = await prisma.counter.findMany({
    where: { id: { in: counterIds }, branch: { businessId } },
    select: { id: true },
  });
  if (counters.length !== counterIds.length) {
    throw new AppError("Loket yang dipilih tidak valid.", 400, "INVALID_COUNTER");
  }
}

export type InviteInput = {
  name: string;
  email: string;
  role: MembershipRole;
  branchIds: string[];
  counterIds?: string[];
};

/**
 * Invites by creating (or reusing) a user with a one-time temporary password.
 * The plain password is returned exactly once so the admin can hand it over;
 * only the bcrypt hash is persisted.
 */
export async function inviteMember(context: BusinessContext, input: InviteInput) {
  requireRole(context, [...MANAGE_ROLES]);
  const email = input.email.toLowerCase().trim();
  if (input.role === "OWNER" && context.role !== "OWNER") {
    throw new AppError("Hanya pemilik bisnis yang dapat menunjuk pemilik lain.", 403, "FORBIDDEN");
  }
  const branchIds = [...new Set(input.branchIds)];
  if (branchIds.length) {
    const branches = await prisma.branch.findMany({
      where: { id: { in: branchIds }, businessId: context.businessId, active: true },
      select: { id: true },
    });
    if (branches.length !== branchIds.length) {
      throw new AppError("Cabang yang dipilih tidak valid.", 400, "INVALID_BRANCH");
    }
  }
  const counterIds = [...new Set(input.counterIds ?? [])];
  await assertCountersBelongToBusiness(context.businessId, counterIds);

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, passwordHash: true },
  });

  const temporaryPassword = existingUser?.passwordHash
    ? null
    : `Antrian-${randomBytes(6).toString("base64url")}`;

  try {
    return await prisma.$transaction(async (tx) => {
      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: { active: true, ...(input.name ? { name: input.name } : {}) },
          })
        : await tx.user.create({
            data: {
              name: input.name,
              email,
              passwordHash: await hash(temporaryPassword!, 12),
            },
          });

      const alreadyMember = await tx.businessMembership.findUnique({
        where: { userId_businessId: { userId: user.id, businessId: context.businessId } },
        select: { id: true },
      });
      if (alreadyMember) {
        throw new AppError(
          "Email ini sudah menjadi anggota bisnis Anda.",
          409,
          "MEMBER_EXISTS",
        );
      }

      const membership = await tx.businessMembership.create({
        data: {
          userId: user.id,
          businessId: context.businessId,
          role: input.role,
          branchScopes: {
            create: branchIds.map((branchId) => ({ branchId })),
          },
          counterScopes: {
            create: counterIds.map((counterId) => ({ counterId })),
          },
        },
        include: {
          user: { select: { id: true, name: true, email: true, active: true } },
          branchScopes: { select: { branchId: true } },
          counterScopes: { select: { counterId: true } },
        },
      });
      await tx.auditLog.create({
        data: auditData({
          businessId: context.businessId,
          actorUserId: context.userId,
          action: "MEMBER_INVITED",
          targetType: "BusinessMembership",
          targetId: membership.id,
          metadata: { email, role: input.role, branchIds },
        }),
      });
      return {
        membershipId: membership.id,
        userId: membership.user.id,
        name: membership.user.name ?? email,
        email,
        role: membership.role,
        active: membership.user.active,
        branchIds: membership.branchScopes.map((scope) => scope.branchId),
        counterIds: membership.counterScopes.map((scope) => scope.counterId),
        joinedAt: membership.createdAt.toISOString(),
        temporaryPassword,
      };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("Email ini sudah terdaftar.", 409, "MEMBER_EXISTS");
    }
    throw error;
  }
}

export type UpdateMemberInput = {
  role?: MembershipRole;
  branchIds?: string[];
  counterIds?: string[];
  active?: boolean;
};

export async function updateMember(
  context: BusinessContext,
  membershipId: string,
  input: UpdateMemberInput,
) {
  requireRole(context, [...MANAGE_ROLES]);
  const membership = await prisma.businessMembership.findFirst({
    where: { id: membershipId, businessId: context.businessId },
    include: { user: { select: { id: true, active: true } } },
  });
  if (!membership) {
    throw new AppError("Anggota tim tidak ditemukan.", 404, "MEMBER_NOT_FOUND");
  }
  if (membership.userId === context.userId && input.role && input.role !== membership.role) {
    throw new AppError("Anda tidak dapat mengubah peran akun sendiri.", 409, "SELF_ROLE_CHANGE");
  }
  if (membership.role === "OWNER" && input.role && input.role !== "OWNER") {
    const owners = await prisma.businessMembership.count({
      where: { businessId: context.businessId, role: "OWNER" },
    });
    if (owners <= 1) {
      throw new AppError(
        "Bisnis harus memiliki minimal satu pemilik.",
        409,
        "LAST_OWNER",
      );
    }
  }
  if (input.role === "OWNER" && context.role !== "OWNER") {
    throw new AppError("Hanya pemilik bisnis yang dapat menunjuk pemilik lain.", 403, "FORBIDDEN");
  }

  let branchIds: string[] | null = null;
  if (input.branchIds) {
    branchIds = [...new Set(input.branchIds)];
    if (branchIds.length) {
      const branches = await prisma.branch.findMany({
        where: { id: { in: branchIds }, businessId: context.businessId, active: true },
        select: { id: true },
      });
      if (branches.length !== branchIds.length) {
        throw new AppError("Cabang yang dipilih tidak valid.", 400, "INVALID_BRANCH");
      }
    }
  }
  let counterIds: string[] | null = null;
  if (input.counterIds) {
    counterIds = [...new Set(input.counterIds)];
    await assertCountersBelongToBusiness(context.businessId, counterIds);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.businessMembership.update({
      where: { id: membership.id },
      data: {
        ...(input.role === undefined ? {} : { role: input.role }),
      },
      include: {
        user: { select: { id: true, name: true, email: true, active: true } },
        branchScopes: { select: { branchId: true } },
        counterScopes: { select: { counterId: true } },
      },
    });
    if (branchIds) {
      await tx.membershipBranchScope.deleteMany({ where: { membershipId: membership.id } });
      if (branchIds.length) {
        await tx.membershipBranchScope.createMany({
          data: branchIds.map((branchId) => ({ membershipId: membership.id, branchId })),
        });
      }
    }
    if (counterIds) {
      await tx.counterMember.deleteMany({ where: { membershipId: membership.id } });
      if (counterIds.length) {
        await tx.counterMember.createMany({
          data: counterIds.map((counterId) => ({ membershipId: membership.id, counterId })),
        });
      }
    }
    if (input.active !== undefined) {
      await tx.user.update({
        where: { id: membership.userId },
        data: { active: input.active },
      });
    }
    await tx.auditLog.create({
      data: auditData({
        businessId: context.businessId,
        actorUserId: context.userId,
        action: "MEMBER_UPDATED",
        targetType: "BusinessMembership",
        targetId: membership.id,
        metadata: { changed: Object.keys(input), role: input.role, branchIds, counterIds },
      }),
    });
    return {
      membershipId: updated.id,
      userId: updated.userId,
      name: updated.user.name ?? updated.user.email ?? "Pengguna",
      email: updated.user.email ?? "",
      role: updated.role,
      active: input.active ?? updated.user.active,
      branchIds: branchIds ?? updated.branchScopes.map((scope) => scope.branchId),
      counterIds: counterIds ?? updated.counterScopes.map((scope) => scope.counterId),
      joinedAt: updated.createdAt.toISOString(),
    };
  });
}

export async function removeMember(context: BusinessContext, membershipId: string) {
  requireRole(context, [...MANAGE_ROLES]);
  const membership = await prisma.businessMembership.findFirst({
    where: { id: membershipId, businessId: context.businessId },
  });
  if (!membership) {
    throw new AppError("Anggota tim tidak ditemukan.", 404, "MEMBER_NOT_FOUND");
  }
  if (membership.userId === context.userId) {
    throw new AppError("Anda tidak dapat mengeluarkan akun sendiri.", 409, "SELF_REMOVE");
  }
  if (membership.role === "OWNER") {
    const owners = await prisma.businessMembership.count({
      where: { businessId: context.businessId, role: "OWNER" },
    });
    if (owners <= 1) {
      throw new AppError("Bisnis harus memiliki minimal satu pemilik.", 409, "LAST_OWNER");
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.businessMembership.delete({ where: { id: membership.id } });
    await tx.auditLog.create({
      data: auditData({
        businessId: context.businessId,
        actorUserId: context.userId,
        action: "MEMBER_REMOVED",
        targetType: "BusinessMembership",
        targetId: membership.id,
        metadata: { userId: membership.userId, role: membership.role },
      }),
    });
  });
  return { id: membership.id };
}
