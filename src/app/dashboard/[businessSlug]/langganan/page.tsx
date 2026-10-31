import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/app-header";
import { ErrorState } from "@/components/error-state";
import { SubscriptionBilling } from "@/components/subscription-billing";
import { guardWorkspace } from "@/components/workspace-guard";
import { getSubscriptionView, listPayments } from "@/modules/billing/subscription-service";
import { brandVars } from "@/modules/tenancy/brand";
import { getTheme } from "@/modules/tenancy/theme-service";

type PageProps = { params: Promise<{ businessSlug: string }> };

export const dynamic = "force-dynamic";
export const metadata = { title: "Langganan | Antrian" };

/**
 * Owner-only billing. The workspace guard runs with
 * `allowInactiveSubscription` so an expired trial can still reach the page that
 * renews it — access everywhere else stays gated.
 */
export default async function SubscriptionPage({ params }: PageProps) {
  const { businessSlug } = await params;
  const guarded = await guardWorkspace(businessSlug, undefined, {
    allowInactiveSubscription: true,
  });
  if (!guarded.ok) return guarded.element;
  const { context, userName } = guarded;

  if (context.role !== "OWNER") {
    return (
      <ErrorState
        code="403"
        title="Halaman ini khusus pemilik bisnis"
        description="Hanya pemilik bisnis yang dapat mengelola langganan dan pembayaran workspace. Hubungi pemilik bila Anda memerlukan perubahan paket."
      />
    );
  }

  const [business, theme, subscription, payments, plans] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: context.businessId },
      select: { name: true },
    }),
    getTheme(context.businessId),
    getSubscriptionView(context.businessId),
    listPayments(context.businessId),
    prisma.plan.findMany({
      where: { active: true },
      orderBy: { monthlyPrice: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        monthlyPrice: true,
        yearlyPrice: true,
      },
    }),
  ]);

  return (
    <div className="min-h-screen bubble-flow text-[#182321]" style={brandVars(theme)}>
      <AppHeader
        businessName={business.name}
        businessSlug={businessSlug}
        theme={theme}
        role={context.role}
        userName={userName}
        active="langganan"
      />
      <main className="mx-auto max-w-[1100px] px-5 py-7 md:px-8 md:py-9">
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-brand-700">
            Langganan
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-[-.03em]">
            Paket, masa aktif, dan pembayaran
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#53615b]">
            Langganan berlaku per perusahaan dan mencakup semua cabang. Setelah pembayaran
            terverifikasi, masa aktif langsung bertambah dan halaman ini ikut diperbarui.
          </p>
        </div>

        <SubscriptionBilling
          businessSlug={businessSlug}
          subscription={subscription}
          plans={plans}
          payments={payments.map((payment) => ({
            id: payment.id,
            orderId: payment.orderId,
            amount: payment.amount,
            status: payment.status,
            cycle: payment.cycle,
            createdAt: payment.createdAt.toISOString(),
            paidAt: payment.paidAt?.toISOString() ?? null,
            planName: payment.plan?.name ?? null,
          }))}
        />
      </main>
    </div>
  );
}
