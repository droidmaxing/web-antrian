import { z } from "zod";
import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/modules/shared/errors";
import { createTrialSubscription } from "@/modules/billing/subscription-service";
import { defaultHours } from "@/modules/tenancy/branch-service";

export const registrationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  companyName: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8).max(128),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;

/**
 * Signing up with Google skips the password form, so only the business name is
 * asked for — the account itself already exists by then.
 */
export const workspaceSchema = z.object({
  companyName: z.string().trim().min(2).max(80),
});

export type WorkspaceInput = z.infer<typeof workspaceSchema>;

/** URL-safe base for a company name; the unique suffix is added by the caller. */
export function businessSlugBase(companyName: string): string {
  return (
    companyName
      .toLowerCase()
      .normalize("NFKD")
      // Aksen terurai jadi huruf + tanda; tanda itu dibuang supaya "Café" → "cafe".
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "bisnis"
  );
}

/**
 * New workspaces are served from the same URL space as existing ones, so the
 * slug has to be unique. A numeric suffix keeps two companies with the same
 * name from colliding instead of failing the whole signup.
 */
async function uniqueBusinessSlug(
  tx: Prisma.TransactionClient,
  companyName: string,
): Promise<string> {
  const base = businessSlugBase(companyName);
  for (let suffix = 0; ; suffix += 1) {
    const slug = suffix === 0 ? base : `${base}-${suffix}`;
    const clash = await tx.business.findUnique({ where: { slug }, select: { id: true } });
    if (!clash) return slug;
    if (suffix > 50) throw new AppError("Nama perusahaan terlalu mirip.", 409, "DUPLICATE_BUSINESS");
  }
}

/**
 * The rows that only make sense together — workspace, owner membership, first
 * branch — plus the 30-day trial. Shared by manual signup and Google signup so
 * both paths produce identical workspaces.
 */
async function createWorkspaceRows(
  tx: Prisma.TransactionClient,
  userId: string,
  companyName: string,
) {
  const business = await tx.business.create({
    data: { name: companyName, slug: await uniqueBusinessSlug(tx, companyName) },
    select: { id: true, slug: true },
  });
  await tx.businessMembership.create({
    data: { userId, businessId: business.id, role: "OWNER" },
  });
  await tx.branch.create({
    data: {
      businessId: business.id,
      name: "Cabang Utama",
      slug: "utama",
      queueConfig: { create: { ticketPrefix: "A", resetDaily: true, estimateBuffer: 0 } },
      operatingHours: { create: defaultHours() },
    },
  });
  await createTrialSubscription(tx, business.id);
  return business;
}

export async function registerAccount(input: RegistrationInput) {
  const passwordHash = await hash(input.password, 12);

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: input.name, email: input.email, passwordHash },
        select: { id: true, name: true, email: true },
      });
      const business = await createWorkspaceRows(tx, user.id, input.companyName);
      await tx.auditLog.create({
        data: {
          businessId: business.id,
          actorUserId: user.id,
          action: "ACCOUNT_REGISTERED",
          targetType: "Business",
          targetId: business.id,
          metadata: { email: user.email, trialDays: 30 },
        },
      });
      return { userId: user.id, name: user.name, email: user.email, businessSlug: business.slug };
    });
  } catch (error) {
    // Two signups can race past the pre-check; the unique index is the truth.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("Email sudah terdaftar. Masuk atau gunakan email lain.", 409, "EMAIL_TAKEN");
    }
    throw error;
  }
}

/**
 * For accounts that already exist without a workspace (signed up with Google,
 * or invited straight into a business), only the workspace is left to build.
 * Repeat calls return the workspace they already own instead of creating a
 * second one.
 */
export async function createWorkspaceForUser(userId: string, companyName: string) {
  const existing = await prisma.businessMembership.findFirst({
    where: { userId, business: { active: true } },
    orderBy: { createdAt: "asc" },
    select: { business: { select: { slug: true } } },
  });
  if (existing) return { businessSlug: existing.business.slug };

  return prisma.$transaction(async (tx) => {
    const business = await createWorkspaceRows(tx, userId, companyName);
    await tx.auditLog.create({
      data: {
        businessId: business.id,
        actorUserId: userId,
        action: "WORKSPACE_CREATED",
        targetType: "Business",
        targetId: business.id,
        metadata: { trialDays: 30 },
      },
    });
    return { businessSlug: business.slug };
  });
}
