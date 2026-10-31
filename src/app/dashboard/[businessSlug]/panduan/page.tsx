import { BookOpen, CircleHelp } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { guardWorkspace } from "@/components/workspace-guard";
import { prisma } from "@/lib/prisma";
import { capabilitiesFor, roleLabel, type Capability } from "@/modules/tenancy/access";
import { brandVars } from "@/modules/tenancy/brand";
import { getTheme } from "@/modules/tenancy/theme-service";
import { guideHref, guideSections } from "@/modules/guide/guide-content";

type PageProps = { params: Promise<{ businessSlug: string }> };

export const dynamic = "force-dynamic";

const CAPABILITY_SUMMARY: Record<Capability, string> = {
  operateQueue: "Memanggil dan menyelesaikan antrean di loket",
  configureBusiness: "Mengatur layanan, loket, cabang, dan fitur",
  manageTeam: "Menambah anggota tim dan mengatur aksesnya",
  viewReports: "Membuka laporan kinerja antrean",
  manageTheme: "Mengubah warna dan logo workspace",
};

/** Tutorial page: steps are filtered by the reader's role and enabled features. */
export default async function GuidePage({ params }: PageProps) {
  const { businessSlug } = await params;
  const guarded = await guardWorkspace(businessSlug);
  if (!guarded.ok) return guarded.element;
  const { context, userName } = guarded;

  const [business, featureRows, theme] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: context.businessId },
      select: { name: true },
    }),
    prisma.featureConfiguration.findMany({
      where: { businessId: context.businessId, enabled: true },
      select: { featureKey: true },
    }),
    getTheme(context.businessId),
  ]);

  const enabledFeatures = featureRows.map((feature) => feature.featureKey);
  const sections = guideSections({ role: context.role, enabledFeatures });
  const capabilities = capabilitiesFor(context.role);
  const granted = (Object.keys(capabilities) as Capability[]).filter(
    (capability) => capabilities[capability],
  );

  return (
    <div
      className="min-h-screen bubble-flow text-[#182321]"
      style={brandVars(theme)}
    >
      <AppHeader
        businessName={business.name}
        businessSlug={businessSlug}
        theme={theme}
        role={context.role}
        userName={userName}
        active="panduan"
      />
      <main className="mx-auto max-w-[1100px] px-5 py-7 md:px-8 md:py-9">
        <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-brand-700">
          Panduan
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-.03em]">
          Panduan penggunaan {business.name}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#53615b]">
          Langkah di bawah ini disesuaikan dengan peran Anda sebagai{" "}
          <strong className="font-semibold text-brand-800">{roleLabel(context.role)}</strong> dan
          fitur yang aktif di workspace ini. Setiap tautan membuka bagian yang dimaksud.
        </p>

        {granted.length > 0 && (
          <section className="mt-6 bubble-card p-5 md:p-6">
            <h2 className="text-[13px] font-semibold tracking-[-.01em]">
              Yang dapat Anda lakukan
            </h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {granted.map((capability) => (
                <li key={capability} className="flex items-start gap-2 text-xs leading-5 text-[#4d5a56]">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-700"
                  />
                  {CAPABILITY_SUMMARY[capability]}
                </li>
              ))}
            </ul>
          </section>
        )}

        {sections.length === 0 ? (
          <section className="mt-6 rounded-2xl bg-white p-8 text-center bubble-panel">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              <BookOpen className="size-5" />
            </div>
            <h2 className="mt-4 text-base font-semibold">Panduan belum tersedia</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#53615b]">
              Belum ada langkah panduan untuk peran Anda pada konfigurasi workspace saat ini.
              Hubungi Super Admin bisnis untuk mengaktifkan fitur yang Anda butuhkan.
            </p>
          </section>
        ) : (
          <div className="mt-6 grid gap-5">
            {sections.map((section, index) => (
              <section
                key={section.title}
                className="bubble-card p-5 shadow-bubble-sm md:p-6"
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-brand-700 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <h2 className="text-[15px] font-semibold tracking-[-.02em]">{section.title}</h2>
                    <p className="mt-0.5 text-xs text-[#66736e]">{section.description}</p>
                  </div>
                </div>
                <ol className="mt-4 grid gap-3 sm:grid-cols-2">
                  {section.steps.map((step) => (
                    <li
                      key={step.title}
                      className="rounded-xl bg-brand-50 p-4 bubble-panel"
                    >
                      <p className="text-xs font-semibold text-[#344440]">{step.title}</p>
                      <p className="mt-1.5 text-[11px] leading-5 text-[#53615b]">{step.detail}</p>
                      {step.href && (
                        <a
                          href={guideHref(step.href, businessSlug)}
                          className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-700 hover:underline"
                        >
                          {step.hrefLabel ?? "Buka"}{" "}
                          <span aria-hidden="true">↗</span>
                        </a>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}

        <section className="mt-6 flex flex-wrap items-start gap-3 rounded-2xl bg-brand-50 p-5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white text-brand-700">
            <CircleHelp className="size-[17px]" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Butuh bantuan lain?</p>
            <p className="mt-1 text-xs leading-5 text-[#53615b]">
              Hubungi Super Admin atau pemilik bisnis untuk perubahan yang di luar peran Anda.
              Kembali ke dashboard kapan saja tanpa kehilangan antrean yang sedang berjalan.
            </p>
            <a
              href={`/dashboard/${businessSlug}`}
              className="mt-3 inline-block text-xs font-semibold text-brand-700 hover:underline"
            >
              Kembali ke dashboard <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
