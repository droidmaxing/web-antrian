import Link from "next/link";
import { auth, isGoogleSignInEnabled } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

/**
 * Auth.js sends OAuth failures back here as `?error=<code>`; without a mapping
 * the operator only sees a bare code and has no idea what to do next.
 */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked:
    "Email ini sudah terdaftar dengan kata sandi. Masuk memakai email dan kata sandi Anda.",
  AccessDenied: "Akun ini tidak aktif. Hubungi pemilik workspace.",
  Configuration: "Masuk dengan Google belum dikonfigurasi di server ini.",
};

function authErrorMessage(error?: string) {
  if (!error) return "";
  return (
    AUTH_ERROR_MESSAGES[error] ??
    "Masuk dengan Google gagal. Coba lagi, atau gunakan email dan kata sandi."
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ registered?: string; error?: string }> }) {
  const session = await auth();
  if (session?.user) redirect("/");
  const googleEnabled = await isGoogleSignInEnabled();
  const { registered, error } = await searchParams;
  const notice = authErrorMessage(error);

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.08fr_.92fr]">
      <section className="relative hidden overflow-hidden bg-brand-900 px-14 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <span aria-hidden className="bubble-blob -right-40 -top-40 h-[34rem] w-[34rem] opacity-40" />
        <span aria-hidden className="bubble-blob -right-24 -top-24 h-[26rem] w-[26rem] opacity-30" style={{ animationDelay: "-6s, -2s" }} />
        <Link href="/register" className="relative flex items-center gap-3 text-lg font-semibold tracking-tight"><span className="flex size-10 items-center justify-center rounded-xl bg-brand-300 text-brand-900"><span className="text-xl font-black">a.</span></span> antrian</Link>
        <div className="relative mb-14 max-w-xl"><p className="mb-5 text-sm font-medium text-brand-300">Satu ruang kendali untuk layanan Anda</p><h1 className="text-5xl font-semibold leading-[1.13] tracking-[-0.04em]">Waktu tunggu lebih singkat. Pengalaman lebih baik.</h1><p className="mt-6 max-w-md text-base leading-7 text-white/65">Kelola antrean, loket, dan cabang bisnis dari satu sistem yang sederhana.</p></div>
        <p className="relative text-xs text-white/40">© 2026 Antrian. Operasional lebih tertata.</p>
      </section>
      <section className="relative isolate flex items-center justify-center overflow-hidden px-6 py-12">
        <span aria-hidden className="bubble-blob -bottom-40 -left-32 -z-10 size-80 opacity-30 max-lg:hidden" />
        <div className="w-full max-w-[420px]">
        <Link href="/register" className="mb-12 flex items-center gap-3 text-lg font-semibold tracking-tight text-brand-900 lg:hidden"><span className="flex size-10 items-center justify-center rounded-xl bg-brand-200 text-brand-700"><span className="text-xl font-black">a.</span></span> antrian</Link>
        <div className="mb-9"><p className="mb-3 text-sm font-medium text-brand-700">Selamat datang kembali</p><h2 className="text-3xl font-semibold tracking-tight text-[#182321]">Masuk ke akun Anda</h2><p className="mt-2 text-sm leading-6 text-[#53615b]">Gunakan email dan kata sandi yang terdaftar untuk melanjutkan.</p></div>
        {registered === "1" && <p role="status" className="mb-4 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800 shadow-bubble-sm">Workspace berhasil dibuat. Silakan masuk dengan akun baru Anda.</p>}
        {notice && <p role="status" className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 shadow-bubble-sm">{notice}</p>}
        <LoginForm googleEnabled={googleEnabled} />
        <p className="mt-7 text-center text-sm text-[#53615b]">Belum punya akun? <Link href="/register" className="font-semibold text-brand-700 hover:underline">Mulai gratis</Link></p>
        <p className="mt-8 text-center text-xs text-[#5d6b67]">Dengan masuk, Anda menyetujui kebijakan privasi dan ketentuan layanan.</p>
      </div></section>
    </main>
  );
}
