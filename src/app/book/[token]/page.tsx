import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PublicBookingForm } from "@/components/public-booking-form";
import { BrandLogo } from "@/components/brand-logo";
import { getBookingConfiguration } from "@/modules/booking/application/booking-service";
import { AppError } from "@/modules/shared/errors";
import { requestFromHeaders } from "@/lib/app-url";
import { brandVars } from "@/modules/tenancy/brand";

type PageProps = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

export default async function PublicBookingPage({ params }: PageProps) {
  const { token } = await params;
  let configuration;
  try {
    configuration = await getBookingConfiguration(
      token,
      requestFromHeaders(await headers()),
    );
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }

  return (
    <main
      className="bubble-flow min-h-screen px-4 py-6 sm:px-6 sm:py-10"
      style={brandVars(configuration.theme)}
    >
      <div className="mx-auto max-w-xl">
        <div className="mb-5 flex items-center justify-center gap-2 text-sm font-semibold tracking-tight text-brand-900">
          <span className="flex size-8 items-center justify-center overflow-hidden rounded-[10px] bg-brand-700 text-sm font-black text-white">
            <BrandLogo theme={configuration.theme} className="text-sm font-black" />
          </span>
          booking online
        </div>
        <section className="overflow-hidden bubble-card bg-white">
          <header className="relative overflow-hidden bg-brand-700 px-5 py-6 text-white sm:px-7 sm:py-7">
            <div className="absolute -right-12 -top-20 size-52 rounded-full border border-white/10" />
            <div className="relative">
              <p className="flex items-center gap-2 text-[11px] font-medium text-white/70">
                <span className="size-1.5 rounded-full bg-brand-300" />
                Reservasi layanan
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-.04em] sm:text-[28px]">
                {configuration.business}
              </h1>
              <p className="mt-1 text-xs text-white/70">
                {configuration.branch.name}
              </p>
              <p className="mt-5 max-w-md text-xs leading-5 text-white/75">
                Pilih layanan dan waktu kunjungan. Slot berdurasi 30 menit dan
                hanya dapat dipesan satu kali.
              </p>
            </div>
          </header>
          <div className="p-5 sm:p-7">
            <PublicBookingForm token={token} configuration={configuration} />
          </div>
        </section>
        <p className="mt-5 text-center text-[11px] leading-4 text-[#5d6b67]">
          Booking tanpa akun · Waktu lokal cabang · Maksimal 30 hari ke depan
        </p>
      </div>
    </main>
  );
}
