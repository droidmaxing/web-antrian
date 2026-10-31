import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicQueueForm } from "@/components/public-queue-form";
import { BrandLogo } from "@/components/brand-logo";
import { getQrConfiguration } from "@/modules/queue/application/public-queue";
import { AppError } from "@/modules/shared/errors";
import { requestFromHeaders } from "@/lib/app-url";
import { brandTitle, brandVars, logoDataUrl } from "@/modules/tenancy/brand";

type PageProps = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

/** Judul tab dan favicon ikut branding workspace pemilik token QR. */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  try {
    const config = await getQrConfiguration(token, requestFromHeaders(await headers()));
    return {
      title: brandTitle(config.theme, config.business),
      icons: { icon: logoDataUrl(config.theme) ?? "/icon.svg" },
    };
  } catch {
    return {};
  }
}

export default async function PublicQueuePage({ params }: PageProps) {
  const { token } = await params;
  let config;
  try {
    config = await getQrConfiguration(token, requestFromHeaders(await headers()));
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }

  return (
    <main
      className="bubble-flow min-h-screen px-5 py-8 sm:py-12"
      style={brandVars(config.theme)}
    >
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 text-sm font-semibold tracking-tight text-brand-900">
          <span className="flex size-8 items-center justify-center overflow-hidden rounded-[10px] bg-brand-700 text-sm font-black text-white">
            <BrandLogo theme={config.theme} className="text-sm font-black" />
          </span>
          {brandTitle(config.theme, config.business)}
        </div>
        <section className="overflow-hidden bubble-card bg-white">
          <div className="relative overflow-hidden bg-brand-700 px-6 pb-6 pt-7 text-white">
            <div className="absolute -right-12 -top-16 size-48 rounded-full border border-white/10" />
            <div className="absolute -right-4 -top-8 size-32 rounded-full border border-white/10" />
            <p className="relative flex items-center gap-2 text-[11px] font-medium text-white/70">
              <span className="size-1.5 rounded-full bg-brand-300" />
              Pendaftaran antrean
            </p>
            <h1 className="relative mt-2 text-2xl font-semibold tracking-[-.04em]">
              {config.business}
            </h1>
            <p className="relative mt-1 text-xs text-white/70">
              {config.branch.name}
            </p>
            <div className="relative mt-6 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-[11px] text-white/80">
              <ClockIcon />
              Ambil nomor dari mana saja. Anda tidak perlu membuat akun.
            </div>
          </div>
          <div className="p-6">
            <h2 className="mb-5 text-base font-semibold tracking-[-.02em] text-brand-900">
              Mulai antrean Anda
            </h2>
            <PublicQueueForm token={token} services={config.services} />
          </div>
        </section>
        <p className="mt-5 text-center text-[11px] text-[#5d6b67]">
          Aman, cepat, dan tanpa perlu mengunduh aplikasi.
        </p>
      </div>
    </main>
  );
}

function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
