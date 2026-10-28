import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.08fr_.92fr]">
      <section className="relative hidden overflow-hidden bg-[#103f37] px-14 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full border border-white/10" />
        <div className="absolute -right-24 -top-24 h-[26rem] w-[26rem] rounded-full border border-white/10" />
        <div className="relative flex items-center gap-3 text-lg font-semibold tracking-tight">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[#a8e6ce] text-[#103f37]">
            <span className="text-xl font-black">a.</span>
          </div>
          antrian
        </div>
        <div className="relative mb-14 max-w-xl">
          <p className="mb-5 flex items-center gap-2 text-sm font-medium text-[#9fd5c4]">
            <span className="size-2 rounded-full bg-[#8ce0b8]" />
            Satu ruang kendali untuk layanan Anda
          </p>
          <h1 className="text-5xl font-semibold leading-[1.13] tracking-[-0.04em]">
            Waktu tunggu lebih singkat. Pengalaman lebih baik.
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-white/65">
            Kelola antrean, loket, dan cabang bisnis dari satu sistem yang
            sederhana.
          </p>
          <div className="mt-12 flex items-center gap-4">
            <div className="flex -space-x-2">
              {["R", "N", "D", "A"].map((initial, index) => (
                <div
                  key={initial}
                  className="flex size-9 items-center justify-center rounded-full border-2 border-[#103f37] bg-[#b7ddcc] text-xs font-bold text-[#16483e]"
                  style={{ opacity: 1 - index * 0.12 }}
                >
                  {initial}
                </div>
              ))}
            </div>
            <p className="text-sm text-white/70">
              Dibuat untuk bisnis yang mengutamakan pelanggan
            </p>
          </div>
        </div>
        <p className="relative text-xs text-white/40">
          © 2026 Antrian. Operasional lebih tertata.
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[420px]">
          <div className="mb-12 flex items-center gap-3 text-lg font-semibold tracking-tight text-[#143e36] lg:hidden">
            <div className="flex size-10 items-center justify-center rounded-xl bg-brand-200 text-brand-700">
              <span className="text-xl font-black">a.</span>
            </div>
            antrian
          </div>
          <div className="mb-9">
            <p className="mb-3 text-sm font-medium text-brand-700">
              Selamat datang kembali
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-[#182321]">
              Masuk ke akun Anda
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#75827f]">
              Gunakan email dan kata sandi yang terdaftar untuk melanjutkan.
            </p>
          </div>
          <LoginForm />
          <div className="mt-8 rounded-xl border border-[#e9edeb] bg-[#f8faf9] p-4">
            <p className="text-xs font-semibold uppercase tracking-[.12em] text-[#75827f]">
              Akun demo lokal
            </p>
            <p className="mt-2 text-sm text-[#344440]">
              admin@antrian.test <span className="mx-1 text-[#b0bbb7]">·</span>{" "}
              Antrian123!
            </p>
            <p className="mt-1 text-xs text-[#687570]">
              SPV: spv@antrian.test / SuperAdmin123!
            </p>
            <p className="mt-1 text-xs text-[#687570]">
              Owner: owner@antrian.test / Owner12345!
            </p>
            <p className="mt-2 text-xs leading-5 text-[#899591]">
              Tersedia setelah database dikonfigurasi dan seed dijalankan.
              Ganti kredensial sebelum deployment.
            </p>
          </div>
          <p className="mt-8 text-center text-xs text-[#9aa5a1]">
            Dengan masuk, Anda menyetujui kebijakan privasi dan ketentuan layanan.
          </p>
        </div>
      </section>
    </main>
  );
}
