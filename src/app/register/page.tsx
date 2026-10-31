import Link from "next/link";
import { auth, isGoogleSignInEnabled } from "@/lib/auth";
import { redirect } from "next/navigation";
import { RegistrationForm } from "@/components/registration-form";
import { GoogleSignInButton } from "@/components/google-sign-in-button";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/");
  const googleEnabled = await isGoogleSignInEnabled();
  return <main className="grid min-h-screen bg-white lg:grid-cols-[1.08fr_.92fr]">
    <section className="hidden bg-brand-900 px-14 py-12 text-white lg:flex lg:flex-col lg:justify-between">
      <Link href="/login" className="flex items-center gap-3 text-lg font-semibold"><span className="grid size-10 place-items-center rounded-xl bg-brand-300 text-xl font-black text-brand-900">a.</span> antrian</Link>
      <div className="mb-14 max-w-xl"><p className="mb-5 text-sm font-medium text-brand-300">30 hari gratis untuk memulai</p><h1 className="text-5xl font-semibold leading-tight tracking-[-0.04em]">Atur antrean dengan lebih tenang.</h1><p className="mt-6 max-w-md text-base leading-7 text-white/65">Buat workspace bisnis Anda dan kelola layanan, cabang, serta antrean dari satu tempat.</p></div>
      <p className="text-xs text-white/40">© 2026 Antrian</p>
    </section>
    <section className="flex items-center justify-center px-6 py-12"><div className="w-full max-w-[420px]">
      <Link href="/login" className="mb-10 flex items-center gap-3 text-lg font-semibold text-brand-900 lg:hidden"><span className="grid size-10 place-items-center rounded-xl bg-brand-200 text-xl font-black text-brand-700">a.</span> antrian</Link>
      <div className="mb-8"><p className="mb-3 text-sm font-medium text-brand-700">Mulai kelola layanan Anda</p><h2 className="text-3xl font-semibold tracking-tight text-[#182321]">Buat akun bisnis</h2><p className="mt-2 text-sm leading-6 text-[#53615b]">Workspace baru dan masa uji coba akan disiapkan otomatis.</p></div>
      {googleEnabled && (
        <div className="mb-6 space-y-4">
          <GoogleSignInButton label="Daftar dengan Google" />
          <div className="flex items-center gap-4 text-xs text-[#5d6b67]"><span className="h-px flex-1 bg-brand-200" />atau dengan email<span className="h-px flex-1 bg-brand-200" /></div>
        </div>
      )}
      <RegistrationForm />
      <p className="mt-7 text-center text-sm text-[#53615b]">Sudah punya akun? <Link href="/login" className="font-semibold text-brand-700 hover:underline">Masuk</Link></p>
    </div></section>
  </main>;
}
