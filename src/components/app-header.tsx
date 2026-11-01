import { AccountMenuButton } from "@/components/account-menu";
import { BrandLogo } from "@/components/brand-logo";
import { capabilitiesFor, roleLabel } from "@/modules/tenancy/access";
import { brandTitle, brandVars, type BrandTheme } from "@/modules/tenancy/brand";
import type { MembershipRole } from "@prisma/client";

const SECTION_LABEL = {
  pengaturan: "Pengaturan",
  panduan: "Panduan",
  langganan: "Langganan",
} as const;

/**
 * Header for the workspace sub-pages (settings, tutorial, subscription). Plain
 * anchors keep these pages usable even before the client bundle loads.
 *
 * Only the current section is named here (with the brand as the way back to the
 * dashboard); repeating the dashboard's navigation made the header two rows
 * tall on laptops and left two anchors with the same accessible name.
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
  active: "pengaturan" | "panduan" | "langganan";
}) {
  const capabilities = capabilitiesFor(role);
  const dashboardHref = `/dashboard/${businessSlug}`;
  const backTo = [
    {
      href: `/dashboard/${businessSlug}/langganan`,
      label: "Langganan",
      show: capabilities.manageBilling,
    },
    { href: `/dashboard/${businessSlug}/pengaturan`, label: "Pengaturan", show: capabilities.configureBusiness },
  ].filter((link) => link.show && link.label !== SECTION_LABEL[active]);

  return (
    <header
      style={brandVars(theme)}
      className="sticky top-0 z-20 border-b border-transparent bg-white/90 shadow-bubble-sm backdrop-blur"
    >
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3 md:px-8">
        <a href={dashboardHref} className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[11px] bg-brand-700 text-white">
            <BrandLogo theme={theme} className="text-base font-black" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[#182321]">
              {brandTitle(theme, businessName)}
            </span>
            <span className="block text-[11px] text-[#5c6a65]">Dashboard</span>
          </span>
        </a>

        <nav
          aria-label="Navigasi workspace"
          className="order-last flex w-full items-center gap-1 text-xs font-medium md:order-none md:ml-6 md:w-auto"
        >
          <span
            aria-current="page"
            className="rounded-lg bg-brand-50 px-3 py-1.5 font-semibold text-brand-700"
          >
            {SECTION_LABEL[active]}
          </span>
          {backTo.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-1.5 text-[#5c6a65] transition hover:bg-brand-50"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <span className="hidden text-right sm:block">
            <span className="block text-xs font-semibold text-[#182321]">{userName}</span>
            <span className="block text-[11px] text-[#66736e]">{roleLabel(role)}</span>
          </span>
          <AccountMenuButton userName={userName} roleLabel={roleLabel(role)} businessName={businessName} />
        </div>
      </div>
    </header>
  );
}
