import { ErrorState } from "@/components/error-state";

export default function WorkspaceNotFound() {
  return (
    <ErrorState
      code="404"
      title="Halaman workspace tidak ada"
      description="Menu atau tautan yang dibuka tidak tersedia untuk workspace ini. Kembali ke dashboard lalu pilih menu yang tersedia."
    />
  );
}