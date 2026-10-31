import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { auth } from "@/lib/auth";
import { AppError } from "@/modules/shared/errors";
import { ErrorState } from "@/components/error-state";
import { requireBusinessContext, type BusinessContext } from "@/modules/tenancy/context";

export type GuardedWorkspace =
  | { ok: true; context: BusinessContext; userName: string }
  | { ok: false; element: ReactElement };

/**
 * Auth + tenancy guard shared by the workspace sub-pages (settings, tutorial).
 * Mirrors the dashboard page: unauthenticated visitors go to the login page,
 * unknown or forbidden workspaces get an explicit reason instead of a blank
 * screen.
 */
export async function guardWorkspace(
  businessSlug: string,
  branchId?: string,
  options: { allowInactiveSubscription?: boolean } = {},
): Promise<GuardedWorkspace> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  try {
    const context = await requireBusinessContext(businessSlug, branchId, options);
    return { ok: true, context, userName: session.user.name ?? "Pengguna" };
  } catch (error) {
    if (error instanceof AppError) {
      if (error.status === 401) redirect("/login");
      if (error.code === "BRANCH_NOT_FOUND") redirect(`/dashboard/${businessSlug}`);
      if (error.status === 404) notFound();
      if (error.status === 403) {
        return {
          ok: false,
          element: (
            <ErrorState
              code="403"
              title="Akses ke workspace ditolak"
              description="Akun Anda tidak memiliki izin untuk membuka workspace ini. Hubungi pemilik bisnis atau administrator."
            />
          ),
        };
      }
    }
    throw error;
  }
}
