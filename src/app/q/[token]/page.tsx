import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PublicQueueForm } from "@/components/public-queue-form";
import { getQrConfiguration } from "@/modules/queue/application/public-queue";
import { AppError } from "@/modules/shared/errors";
import { requestFromHeaders } from "@/lib/app-url";

type PageProps = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

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
    <main className="min-h-screen bg-[#f3f7f5] px-5 py-8 sm:py-12">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 text-sm font-semibold tracking-tight text-[#24483c]">
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-[#176b5b] text-sm font-black text-white">
            a.
          </span>
          antrean digital
        </div>
        <section className="overflow-hidden rounded-[24px] border border-[#e8eeeb] bg-white shadow-[0_18px_60px_rgba(28,60,47,.08)]">
          <div className="relative overflow-hidden bg-[#176b5b] px-6 pb-6 pt-7 text-white">
            <div className="absolute -right-12 -top-16 size-48 rounded-full border border-white/10" />
            <div className="absolute -right-4 -top-8 size-32 rounded-full border border-white/10" />
            <p className="relative flex items-center gap-2 text-[11px] font-medium text-white/70">
              <span className="size-1.5 rounded-full bg-[#a8e6ce]" />
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
            <h2 className="mb-5 text-base font-semibold tracking-[-.02em] text-[#25352f]">
              Mulai antrean Anda
            </h2>
            <PublicQueueForm token={token} services={config.services} />
          </div>
        </section>
        <p className="mt-5 text-center text-[10px] text-[#a0aaa6]">
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
