import { MembershipRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/modules/shared/errors";
import { auditData } from "@/modules/shared/audit";
import { hashPassword, temporaryPassword } from "@/modules/shared/password";
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
    active: membership.active && membership.user.active,
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

  const password = existingUser?.passwordHash ? null : temporaryPassword();

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
              passwordHash: await hashPassword(password!),
            },
          });

      const alreadyMember = await tx.businessMembership.findUnique({
        where: { userId_businessId: { userId: user.id, businessId: context.businessId } },
        select: { id: true, active: true },
      });
      if (alreadyMember?.active) {
        throw new AppError(
          "Email ini sudah menjadi anggota bisnis Anda.",
          409,
          "MEMBER_EXISTS",
        );
      }
      if (alreadyMember) {
        // Anggota yang pernah dinonaktifkan diaktifkan lagi, bukan dibuat ulang,
        // supaya riwayat audit dan relasinya tetap satu baris.
        const restored = await tx.businessMembership.update({
          where: { id: alreadyMember.id },
          data: { active: true, role: input.role },
          include: {
            user: { select: { id: true, name: true, email: true, active: true } },
            branchScopes: { select: { branchId: true } },
            counterScopes: { select: { counterId: true } },
          },
        });
        await tx.membershipBranchScope.deleteMany({ where: { membershipId: restored.id } });
        if (branchIds.length) {
          await tx.membershipBranchScope.createMany({
            data: branchIds.map((branchId) => ({ membershipId: restored.id, branchId })),
          });
        }
        // Loket hanya diganti kalau memang dikirim; kalau tidak, penugasan lama tetap utuh.
        if (input.counterIds !== undefined) {
          await tx.counterMember.deleteMany({ where: { membershipId: restored.id } });
          if (counterIds.length) {
            await tx.counterMember.createMany({
              data: counterIds.map((counterId) => ({ membershipId: restored.id, counterId })),
            });
          }
        }
        const restoredCounterIds =
          input.counterIds === undefined
            ? restored.counterScopes.map((scope) => scope.counterId)
            : counterIds;
        await tx.auditLog.create({
          data: auditData({
            businessId: context.businessId,
            actorUserId: context.userId,
            action: "MEMBER_REACTIVATED",
            targetType: "BusinessMembership",
            targetId: restored.id,
            metadata: { email, role: input.role },
          }),
        });
        return {
          membershipId: restored.id,
          userId: restored.user.id,
          name: restored.user.name ?? email,
          email,
          role: restored.role,
          active: true,
          branchIds,
          counterIds: restoredCounterIds,
          joinedAt: restored.createdAt.toISOString(),
          temporaryPassword: null,
        };
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
        temporaryPassword: password,
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
      // Nonaktif = keanggotaan dan akunnya ikut nonaktif, tapi barisnya tetap ada.
      await tx.businessMembership.update({
        where: { id: membership.id },
        data: { active: input.active },
      });
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
  // Keluarkan = nonaktifkan keanggotaan, bukan hapus: antrean, audit, dan
  // penugasan loket yang pernah dibuat anggota ini tetap menunjuk baris yang sama.
  await prisma.$transaction(async (tx) => {
    await tx.businessMembership.update({
      where: { id: membership.id },
      data: { active: false },
    });
    const otherMemberships = await tx.businessMembership.count({
      where: { userId: membership.userId, active: true, id: { not: membership.id } },
    });
    if (otherMemberships === 0) {
      await tx.user.update({ where: { id: membership.userId }, data: { active: false } });
    }
    await tx.auditLog.create({
      data: auditData({
        businessId: context.businessId,
        actorUserId: context.userId,
        action: "MEMBER_DEACTIVATED",
        targetType: "BusinessMembership",
        targetId: membership.id,
        metadata: { userId: membership.userId, role: membership.role },
      }),
    });
  });
  return { id: membership.id };
}

/**
 * Reset kata sandi anggota turunan: sistem membuat sandi sementara yang hanya
 * dikembalikan sekali (hanya hash yang disimpan) — sama seperti alur undang
 * anggota, jadi tidak ada sandi yang bisa dibaca ulang dari database.
 */
export async function resetMemberPassword(context: BusinessContext, membershipId: string) {
  requireRole(context, [...MANAGE_ROLES]);
  const membership = await prisma.businessMembership.findFirst({
    where: { id: membershipId, businessId: context.businessId },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!membership) {
    throw new AppError("Anggota tim tidak ditemukan.", 404, "MEMBER_NOT_FOUND");
  }
  if (!membership.active) {
    throw new AppError(
      "Anggota ini sedang nonaktif. Aktifkan dulu sebelum mereset sandinya.",
      409,
      "MEMBER_INACTIVE",
    );
  }
  if (membership.role === "OWNER" && context.role !== "OWNER") {
    throw new AppError(
      "Hanya pemilik bisnis yang dapat mereset sandi pemilik lain.",
      403,
      "FORBIDDEN",
    );
  }

  const password = temporaryPassword();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: membership.userId },
      data: { passwordHash: await hashPassword(password), active: true },
    });
    await tx.auditLog.create({
      data: auditData({
        businessId: context.businessId,
        actorUserId: context.userId,
        action: "MEMBER_PASSWORD_RESET",
        targetType: "User",
        targetId: membership.userId,
        metadata: { email: membership.user.email },
      }),
    });
  });
  return { temporaryPassword: password, email: membership.user.email ?? "" };
}
