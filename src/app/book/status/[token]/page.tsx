import { AccessTokenType } from "@prisma/client";
import { PublicBookingStatus } from "@/components/public-booking-status";
import { BrandLogo } from "@/components/brand-logo";
import { brandVars } from "@/modules/tenancy/brand";
import { getThemeForToken } from "@/modules/tenancy/theme-service";

type PageProps = { params: Promise<{ token: string }> };
export const dynamic = "force-dynamic";

export default async function BookingStatusPage({ params }: PageProps) {
  const { token } = await params;
  const theme = await getThemeForToken(token, AccessTokenType.BOOKING);
  return (
    <main className="bubble-flow min-h-screen px-4 py-8 sm:px-6 sm:py-12" style={brandVars(theme)}>
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-2 text-sm font-semibold tracking-tight text-brand-900">
          <span className="flex size-9 items-center justify-center overflow-hidden rounded-2xl bg-brand-700 shadow-bubble-lift">
            <BrandLogo theme={theme} className="text-sm font-black text-white" />
          </span>
          konfirmasi booking
        </div>
        <PublicBookingStatus token={token} />
        <p className="mt-5 text-center text-[11px] text-muted-foreground">
          Halaman status diperbarui otomatis.
        </p>
      </div>
    </main>
  );
}
