import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { PlatformNav } from "@/components/platform-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { requirePlatformAdmin } from "@/modules/platform/access";
import { AppError } from "@/modules/shared/errors";

export const dynamic = "force-dynamic";
export const metadata = { title: "Konsol Master Admin" };

/**
 * Satu kali guard untuk seluruh konsol: setiap halaman di bawah `/platform`
 * sudah dipastikan dibuka Master Admin.
 *
 * Guard harus mengalihkan (redirect), bukan mengembalikan elemen error: halaman
 * anak tetap dirender Next walau layout tidak memakai `children`, sehingga data
 * platform bisa bocor ke HTML pengguna biasa.
 */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  let admin: { id: string; name: string | null; email: string | null };
  try {
    admin = await requirePlatformAdmin();
  } catch (error) {
    if (error instanceof AppError && error.status === 401) redirect("/login");
    if (error instanceof AppError && error.status === 403) redirect("/tanpa-akses");
    throw error;
  }

  return (
    <div className="min-h-screen bubble-flow text-[#182321]">
      <header className="sticky top-0 z-20 border-b border-transparent bg-white/90 shadow-bubble-sm backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-3 px-5 py-3 md:px-8">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-brand-700 text-base font-black text-white">
            a.
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Konsol Master Admin</p>
            <p className="truncate text-[11px] text-[#5c6a65]">Antrian · seluruh perusahaan</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-right sm:block">
              <span className="block truncate text-xs font-semibold">{admin.name ?? "Master Admin"}</span>
              <span className="block truncate text-[11px] text-[#5c6a65]">{admin.email}</span>
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-5 py-6 md:flex-row md:gap-7 md:px-8 md:py-8">
        <PlatformNav />
        <main className="grid min-w-0 flex-1 content-start gap-5">{children}</main>
      </div>
    </div>
  );
}
