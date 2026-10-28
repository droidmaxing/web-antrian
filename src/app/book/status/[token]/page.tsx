import { PublicBookingStatus } from "@/components/public-booking-status";

type PageProps = { params: Promise<{ token: string }> };
export const dynamic = "force-dynamic";

export default async function BookingStatusPage({ params }: PageProps) {
  const { token } = await params;
  return (
    <main className="min-h-screen bg-[#f3f7f5] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-2 text-sm font-semibold tracking-tight text-[#24483c]">
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-brand-700 text-sm font-black text-white">
            a.
          </span>
          konfirmasi booking
        </div>
        <PublicBookingStatus token={token} />
        <p className="mt-5 text-center text-[10px] text-[#9aa5a1]">
          Halaman status diperbarui otomatis.
        </p>
      </div>
    </main>
  );
}
