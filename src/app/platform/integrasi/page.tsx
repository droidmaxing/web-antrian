import { headers } from "next/headers";
import { KeyRound, Sparkles } from "lucide-react";
import { PlatformGoogleApiKeyForm } from "@/components/platform-google-api-key-form";
import { PlatformGoogleLoginForm } from "@/components/platform-google-login-form";
import { PlatformMidtransForm } from "@/components/platform-midtrans-form";
import { PlatformPageHeader, Section } from "@/components/platform-ui";
import { absoluteUrl } from "@/lib/app-url";
import { googleApiKeyStatus } from "@/modules/billing/google-settings";
import { midtransServerKeyStatus } from "@/modules/billing/midtrans-settings";
import { googleLoginStatus } from "@/modules/platform/google-login";

export const metadata = { title: "Integrasi | Konsol Master Admin" };

export default async function PlatformIntegrationsPage() {
  const [midtrans, googleLogin, googleKey, requestHeaders] = await Promise.all([
    midtransServerKeyStatus(),
    googleLoginStatus(),
    googleApiKeyStatus(),
    headers(),
  ]);

  let redirectUri = "/api/auth/callback/google";
  try {
    redirectUri = absoluteUrl("/api/auth/callback/google", requestHeaders);
  } catch {
    // APP_URL belum diatur: tampilkan jalur relatif saja daripada menggagalkan halaman.
  }

  return (
    <>
      <PlatformPageHeader
        eyebrow="Integrasi"
        title="Kredensial layanan eksternal"
        description="Semua kredensial disimpan terenkripsi di database dan tidak pernah dikirim kembali ke browser. Environment hanya dipakai sebagai cadangan."
      />
      <Section
        icon={Sparkles}
        title="Login dengan Google"
        description="Satu OAuth client berlaku untuk seluruh deployment, bukan per perusahaan. Tanpa kredensial, tombol Google disembunyikan."
      >
        <PlatformGoogleLoginForm initialStatus={googleLogin} redirectUri={redirectUri} />
      </Section>
      <Section
        icon={KeyRound}
        title="Google API key"
        description="Kunci API untuk fitur yang memanggil layanan Google (bukan login OAuth)."
      >
        <PlatformGoogleApiKeyForm initialStatus={googleKey} />
      </Section>
      <Section
        icon={KeyRound}
        title="Midtrans"
        description="Server key sandbox dipakai untuk checkout dan verifikasi webhook pembayaran."
      >
        <PlatformMidtransForm initialStatus={midtrans} />
      </Section>
    </>
  );
}
