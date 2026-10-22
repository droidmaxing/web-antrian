import type { Prisma } from "@prisma/client";

/**
 * Shape helper for `auditLog.create` calls so every mutation writes the same
 * columns. Audit writes happen inside the same transaction as the mutation.
 */
export function auditData(input: {
  businessId: string;
  actorUserId: string;
  branchId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  return {
    businessId: input.businessId,
    actorUserId: input.actorUserId,
    branchId: input.branchId ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
}
