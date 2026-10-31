import { Users2 } from "lucide-react";
import { PlatformTable, type PlatformRow } from "@/components/platform-table";
import { PlatformPageHeader, Section } from "@/components/platform-ui";
import { dateLabel } from "@/modules/platform/console-format";
import { listPlatformUsers } from "@/modules/platform/platform-service";

export const metadata = { title: "Pengguna | Konsol Master Admin" };

export default async function PlatformUsersPage() {
  const users = await listPlatformUsers({ page: 1, pageSize: 100 });

  const rows: PlatformRow[] = users.items.map((user) => {
    const [primary, ...rest] = user.memberships;
    return {
      id: user.id,
      cells: [
        { text: user.name ?? "Tanpa nama", strong: true },
        { text: user.email ?? "—", mono: true },
        user.platformRole === "MASTER_ADMIN"
          ? { text: "Master Admin", tone: "warn" }
          : { text: "Pengguna", muted: true },
        primary
          ? {
              text: `${primary.business.name} · ${primary.role}`,
              sub: rest.length ? `+${rest.length} workspace lain` : undefined,
            }
          : { text: "Tanpa workspace", muted: true },
        { text: user.active ? "Aktif" : "Nonaktif", tone: user.active ? "ok" : "off" },
        { text: dateLabel(user.createdAt) },
      ],
    };
  });

  return (
    <>
      <PlatformPageHeader
        eyebrow="Pengguna"
        title="Akun lintas perusahaan"
        description="Peran platform bersifat lintas perusahaan; peran di dalam workspace diatur pemilik masing-masing."
      />
      <Section
        icon={Users2}
        title="Daftar pengguna"
        description={`${users.total} akun terdaftar, terbaru lebih dulu.`}
      >
        <PlatformTable
          columns={["Nama", "Email", "Peran platform", "Perusahaan & peran", "Status", "Dibuat"]}
          rows={rows}
          unit="pengguna"
          empty="Belum ada pengguna."
          minWidth={840}
        />
      </Section>
    </>
  );
}
