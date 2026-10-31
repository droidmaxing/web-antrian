import { ErrorState } from "@/components/error-state";

export const metadata = { title: "Akses ditolak | Antrian" };

/**
 * Tujuan pengalihan guard konsol platform: satu halaman statis di luar
 * `/platform`, supaya halaman anak tidak pernah dirender untuk non-admin.
 */
export default function NoAccessPage() {
  return (
    <ErrorState
      code="403"
      title="Halaman ini khusus Master Admin"
      description="Akun Anda terdaftar sebagai pengguna workspace. Konsol platform hanya dapat dibuka oleh akun dengan peran Master Admin."
    />
  );
}
