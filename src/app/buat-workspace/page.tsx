import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SignOutButton } from "@/components/sign-out-button";
import { WorkspaceSetupForm } from "@/components/workspace-setup-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Buat workspace | Antrian" };

/**
 * Landing spot for a signed-in account without a workspace — currently the
 * Google signup path. Without this page such an account would bounce between
 * "/" and "/login" forever.
 */
export default async function WorkspaceSetupPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.businessMembership.findFirst({
    where: { userId: session.user.id, business: { active: true } },
    orderBy: { createdAt: "asc" },
    select: { business: { select: { slug: true } } },
  });
  if (membership) redirect(`/dashboard/${membership.business.slug}`);

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.08fr_.92fr]">
      <section className="hidden bg-brand-900 px-14 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="flex items-center gap-3 text-lg font-semibold">
          <span className="grid size-10 place-items-center rounded-xl bg-brand-300 text-xl font-black text-brand-900">
            a.
          </span>
          antrian
        </Link>
        <div className="mb-14 max-w-xl">
          <p className="mb-5 text-sm font-medium text-brand-300">Satu langkah lagi</p>
          <h1 className="text-5xl font-semibold leading-tight tracking-[-0.04em]">
            Beri nama bisnis Anda.
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-white/65">
            Akun sudah aktif. Setelah nama diisi, workspace dengan cabang utama dan uji coba 30
            hari langsung dibuat.
          </p>
        </div>
        <p className="text-xs text-white/40">© 2026 Antrian</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[420px]">
          <Link
            href="/"
            className="mb-10 flex items-center gap-3 text-lg font-semibold text-brand-900 lg:hidden"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-brand-200 text-xl font-black text-brand-700">
              a.
            </span>
            antrian
          </Link>
          <div className="mb-8">
            <p className="mb-3 text-sm font-medium text-brand-700">Masuk sebagai</p>
            <h2 className="text-3xl font-semibold tracking-tight text-[#182321]">
              {session.user.email ?? session.user.name ?? "akun Anda"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#53615b]">
              Nama bisnis ini muncul di layar tunggu, tiket, dan tautan antrean publik.
            </p>
          </div>
          <WorkspaceSetupForm />
          <div className="mt-8 flex items-center justify-center">
            <SignOutButton />
          </div>
        </div>
      </section>
    </main>
  );
}
