import { headers } from "next/headers";
import { PublicQueueStatus } from "@/components/public-queue-status";
import { absoluteUrl } from "@/lib/app-url";

type PageProps = { params: Promise<{ token: string }> };

export default async function QueueStatusPage({ params }: PageProps) {
  const { token } = await params;
  const requestHeaders = await headers();
  return (
    <main className="min-h-screen bg-[#f3f7f5] px-5 py-8 sm:py-12">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 text-sm font-semibold tracking-tight text-[#24483c]">
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-brand-700 text-sm font-black text-white">
            a.
          </span>
          status antrean
        </div>
        <PublicQueueStatus
          token={token}
          statusUrl={absoluteUrl(`/q/status/${token}`, requestHeaders)}
        />
        <p className="mt-5 text-center text-[10px] text-[#a0aaa6]">
          Halaman ini diperbarui otomatis setiap beberapa detik.
        </p>
      </div>
    </main>
  );
}
