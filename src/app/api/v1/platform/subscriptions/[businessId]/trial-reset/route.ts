import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/modules/platform/access";
import { AppError, errorResponse } from "@/modules/shared/errors";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ businessId: string }> }
) {
  try {
    const admin = await requirePlatformAdmin();
    const { businessId } = await params;

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new AppError("Workspace tidak ditemukan.", 404, "BUSINESS_NOT_FOUND");
    }

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 30);

    const subscription = await prisma.subscription.upsert({
      where: { businessId },
      update: {
        status: "TRIAL",
        trialEndsAt,
        currentPeriodEnd: trialEndsAt,
      },
      create: {
        businessId,
        status: "TRIAL",
        trialEndsAt,
        currentPeriodEnd: trialEndsAt,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        businessId,
        actorUserId: admin.id,
        action: "RESET_TRIAL",
        targetType: "SUBSCRIPTION",
        targetId: subscription.id,
        metadata: { trialEndsAt: trialEndsAt.toISOString() },
      },
    });

    return Response.json(
      {
        data: {
          id: subscription.id,
          status: subscription.status,
          trialEndsAt: subscription.trialEndsAt,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
