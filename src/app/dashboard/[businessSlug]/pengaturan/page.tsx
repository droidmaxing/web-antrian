import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/app-header";
import { ErrorState } from "@/components/error-state";
import { AccessLinks } from "@/components/access-links";
import { FeatureSettings } from "@/components/feature-settings";
import { ThemeSettings } from "@/components/theme-settings";
import { guardWorkspace } from "@/components/workspace-guard";
import { capabilitiesFor } from "@/modules/tenancy/access";
import { brandVars } from "@/modules/tenancy/brand";
import { getTheme } from "@/modules/tenancy/theme-service";

type PageProps = {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ branch?: string }>;
};

export const dynamic = "force-dynamic";

/**
 * Everything that configures the workspace lives here instead of inside the
 * operational dashboard: theme and logo (Super Admin), feature switches, and the
 * customer-facing links.
 */
export default async function SettingsPage({ params, searchParams }: PageProps) {
  const { businessSlug } = await params;
  const { branch: requestedBranchId } = await searchParams;
  const guarded = await guardWorkspace(businessSlug, requestedBranchId || undefined);
  if (!guarded.ok) return guarded.element;
  const { context, userName } = guarded;
  const capabilities = capabilitiesFor(context.role);

  if (!capabilities.configureBusiness) {
    return (
      <ErrorState
        code="403"
        title="Halaman ini khusus Super Admin"
        description="Pengaturan warna, logo, dan fitur bisnis hanya dapat dibuka oleh Super Admin atau pemilik bisnis. Hubungi administrator bila Anda memerlukan perubahan."
      />
    );
  }

  const [business, featureRows, theme] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: context.businessId },
      select: {
        name: true,
        branches: {
          where: {
            active: true,
            ...(context.branchIds ? { id: { in: context.branchIds } } : {}),
          },
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true },
        },
      },
    }),
    prisma.featureConfiguration.findMany({
      where: { businessId: context.businessId, enabled: true },
      select: { featureKey: true },
    }),
    getTheme(context.businessId),
  ]);

  const enabledFeatures = featureRows.map((feature) => feature.featureKey);
  const branch =
    business.branches.find((option) => option.id === requestedBranchId) ?? business.branches[0];

  return (
    <div className="min-h-screen bubble-flow text-[#182321]" style={brandVars(theme)}>
      <AppHeader
        businessName={business.name}
        businessSlug={businessSlug}
        theme={theme}
        role={context.role}
        userName={userName}
        active="pengaturan"
      />
      <main className="mx-auto max-w-[1100px] px-5 py-7 md:px-8 md:py-9">
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-brand-700">
            Pengaturan
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-[-.03em]">
            Tampilan, fitur, dan akses pelanggan
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#53615b]">
            Perubahan di sini berlaku untuk seluruh pengguna workspace. Pengaturan warna dan logo
            hanya tersedia bagi Super Admin.
          </p>
        </div>

        {business.branches.length > 1 && branch && (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[#52615b]">Cabang:</span>
            {business.branches.map((option) => (
              <a
                key={option.id}
                href={`/dashboard/${businessSlug}/pengaturan?branch=${encodeURIComponent(option.id)}`}
                aria-current={option.id === branch.id ? "true" : undefined}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  option.id === branch.id
                    ? "border-brand-700 bg-brand-50 font-semibold text-brand-700"
                    : "border-brand-200 text-[#52615b] hover:bg-brand-50"
                }`}
              >
                {option.name}
              </a>
            ))}
          </div>
        )}

        <div className="grid gap-5">
          {capabilities.manageTheme && (
            <ThemeSettings businessSlug={businessSlug} initialTheme={theme} />
          )}
          <div className="grid gap-5 2xl:grid-cols-2">
            <FeatureSettings businessSlug={businessSlug} enabledFeatures={enabledFeatures} />
            {branch ? (
              <AccessLinks
                businessSlug={businessSlug}
                branchId={branch.id}
                qrEnabled={enabledFeatures.includes("QR_QUEUE")}
                displayEnabled={enabledFeatures.includes("TV_DISPLAY")}
                bookingEnabled={enabledFeatures.includes("BOOKING")}
              />
            ) : (
              <section className="bubble-card p-5 text-sm text-[#53615b] md:p-6">
                Belum ada cabang aktif, sehingga tautan pelanggan belum dapat dibuat.
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
