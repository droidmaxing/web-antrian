import { BrandLogo } from "@/components/brand-logo";
import { SignOutButton } from "@/components/sign-out-button";
import { capabilitiesFor, roleLabel } from "@/modules/tenancy/access";
import { brandVars, type BrandTheme } from "@/modules/tenancy/brand";
import type { MembershipRole } from "@prisma/client";

/**
 * Header for the workspace sub-pages (settings, tutorial). Plain anchors keep
 * these pages usable even before the client bundle loads.
 */
export function AppHeader({
  businessName,
  businessSlug,
  theme,
  role,
  userName,
  active,
}: {
  businessName: string;
  businessSlug: string;
  theme: BrandTheme;
  role: MembershipRole;
  userName: string;
  active: "pengaturan" | "panduan";
}) {
  const capabilities = capabilitiesFor(role);
  const links = [
    { href: `/dashboard/${businessSlug}`, label: "Dashboard", id: "dashboard", show: true },
    {
      href: `/dashboard/${businessSlug}/panduan`,
      label: "Pelajari sistem",
      id: "panduan",
      show: true,
    },
    {
      href: `/dashboard/${businessSlug}/pengaturan`,
      label: "Pengaturan",
      id: "pengaturan",
      show: capabilities.configureBusiness,
    },
  ].filter((link) => link.show);

  return (
    <header
      style={brandVars(theme.primaryColor)}
      className="sticky top-0 z-20 border-b border-[#e9edeb] bg-white/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3 md:px-8">
        <a href={`/dashboard/${businessSlug}`} className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[11px] bg-brand-700 text-white">
            <BrandLogo theme={theme} className="text-base font-black" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[#182321]">
              {businessName}
            </span>
            <span className="block text-[11px] text-[#889590]">Kembali ke dashboard</span>
          </span>
        </a>

        <nav aria-label="Navigasi workspace" className="flex items-center gap-1 text-xs font-medium">
          {links.map((link) => (
            <a
              key={link.id}
              href={link.href}
              aria-current={link.id === active ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 transition ${
                link.id === active
                  ? "bg-brand-50 font-semibold text-brand-700"
                  : "text-[#5c6a65] hover:bg-[#f5f7f6]"
              }`}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <span className="hidden text-right sm:block">
            <span className="block text-xs font-semibold text-[#182321]">{userName}</span>
            <span className="block text-[10px] text-[#929e99]">{roleLabel(role)}</span>
          </span>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
