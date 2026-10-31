import { headers } from "next/headers";
import { AccessTokenType } from "@prisma/client";
import { PublicQueueStatus } from "@/components/public-queue-status";
import { BrandLogo } from "@/components/brand-logo";
import { absoluteUrl } from "@/lib/app-url";
import { brandVars } from "@/modules/tenancy/brand";
import { getThemeForToken } from "@/modules/tenancy/theme-service";

type PageProps = { params: Promise<{ token: string }> };

export default async function QueueStatusPage({ params }: PageProps) {
  const { token } = await params;
  const [requestHeaders, theme] = await Promise.all([
    headers(),
    getThemeForToken(token, AccessTokenType.QUEUE_STATUS),
  ]);
  return (
    <main className="bubble-flow min-h-screen px-5 py-8 sm:py-12" style={brandVars(theme)}>
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 text-sm font-semibold tracking-tight text-brand-900">
          <span className="flex size-9 items-center justify-center overflow-hidden rounded-2xl bg-brand-700 shadow-bubble-lift">
            <BrandLogo theme={theme} className="text-sm font-black text-white" />
          </span>
          status antrean
        </div>
        <PublicQueueStatus
          token={token}
          statusUrl={absoluteUrl(`/q/status/${token}`, requestHeaders)}
        />
        <p className="mt-5 text-center text-[11px] text-muted-foreground">
          Halaman ini diperbarui otomatis setiap beberapa detik.
        </p>
      </div>
    </main>
  );
}
