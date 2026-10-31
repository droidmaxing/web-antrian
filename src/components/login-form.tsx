"use client";

import { signIn } from "next-auth/react";
import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { InlineNotice } from "@/components/inline-notice";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
} from "lucide-react";

export function LoginForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    try {
      const result = await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirect: false,
      });
      if (result?.error) {
        setError("Email atau kata sandi tidak sesuai.");
        setLoading(false);
        return;
      }
      router.replace("/");
    } catch {
      setError("Tidak dapat menghubungi layanan masuk. Periksa koneksi lalu coba lagi.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {googleEnabled && (
        <>
          <GoogleSignInButton />
          <div className="flex items-center gap-4 text-xs text-[#5d6b67]">
            <span className="h-px flex-1 bg-brand-200" />
            atau masuk dengan email
            <span className="h-px flex-1 bg-brand-200" />
          </div>
        </>
      )}
      <form onSubmit={handleSubmit} className="space-y-5">
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-[#344440]">
          Alamat email
        </span>
        <span className="relative block">
          <Mail className="absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-[#626a67]" />
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder="nama@perusahaan.com"
            className="h-12 w-full rounded-xl bubble-field bg-white pl-11 pr-4 text-sm outline-none transition placeholder:text-[#646a68]"
          />
        </span>
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-[#344440]">
          Kata sandi
        </span>
        <span className="relative block">
          <LockKeyhole className="absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-[#626a67]" />
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            maxLength={128}
            placeholder="Masukkan kata sandi"
            className="h-12 w-full rounded-xl bubble-field bg-white pl-11 pr-12 text-sm outline-none transition placeholder:text-[#646a68]"
          />
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            aria-label={
              showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
            }
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#626a67] hover:text-[#344440]"
          >
            {showPassword ? (
              <EyeOff className="size-[17px]" />
            ) : (
              <Eye className="size-[17px]" />
            )}
          </button>
        </span>
      </label>
      {error && <InlineNotice message={error} />}
      <button
        type="submit"
        disabled={loading}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-700 text-sm font-semibold text-white shadow-bubble-lift transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? (
          <>
            <LoaderCircle className="size-4 animate-spin" /> Memverifikasi...
          </>
        ) : (
          <>
            Masuk ke dashboard <ArrowRight className="size-4" />
          </>
        )}
      </button>
    </form>
    </div>
  );
}
